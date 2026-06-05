/**
 * RSA PKCS1 v1.5 encryption for Paycrest recipient details (gateway path).
 *
 * The Paycrest aggregator decrypts `message_hash` with Go's
 * `crypto/rsa.DecryptPKCS1v15`, so the SDK must encrypt with the matching
 * PKCS1 v1.5 padding (NOT OAEP — those are incompatible at the byte level).
 *
 * Runtime auto-detection:
 *   - Node / Bun / SSR / Deno-with-Node-shim: `node:crypto.publicEncrypt`
 *     with `RSA_PKCS1_PADDING`.
 *   - True browsers / RN / Workers: a small BigInt-based PKCS1 v1.5 encoder
 *     plus raw RSA exponentiation. WebCrypto's `subtle.encrypt` only
 *     supports OAEP for RSA, which the aggregator can't decrypt.
 *
 * The Cairo Gateway expects the encrypted blob as a UTF-8 ByteArray on
 * `create_order`. Both code paths return a base64-encoded string; pass it
 * straight to `populateCreateOrder({ messageHash })`.
 */

const PEM_BEGIN = "-----BEGIN PUBLIC KEY-----";
const PEM_END = "-----END PUBLIC KEY-----";

function pemToSpki(pem: string): Uint8Array {
  const trimmed = pem.trim();
  const start = trimmed.indexOf(PEM_BEGIN);
  const end = trimmed.indexOf(PEM_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "Paycrest public key is not a valid PEM (missing BEGIN/END PUBLIC KEY markers)"
    );
  }
  const body = trimmed
    .slice(start + PEM_BEGIN.length, end)
    .replace(/[\r\n\s]+/g, "");
  return base64Decode(body);
}

/**
 * Re-emit a PEM in canonical form (standard armor, 64-char base64 lines,
 * `\n` separators) from whatever the caller passed. `pemToSpki` already
 * tolerates CRLF / indentation / surrounding whitespace; rebuilding from
 * its output means the strict OpenSSL-backed Node path accepts the same
 * lenient inputs the BigInt path does. Doubles as validation — throws on
 * a malformed PEM.
 */
function canonicalizePem(pem: string): string {
  const der = pemToSpki(pem);
  const body = base64Encode(der);
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `${PEM_BEGIN}\n${lines.join("\n")}\n${PEM_END}\n`;
}

function base64Decode(value: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const buf = (
    globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }
  ).Buffer?.from(value, "base64");
  if (buf) return new Uint8Array(buf);
  throw new Error("No base64 decoder available in this environment");
}

function base64Encode(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return globalThis.btoa(binary);
  }
  const Buf = (
    globalThis as {
      Buffer?: { from(b: Uint8Array): { toString(e: string): string } };
    }
  ).Buffer;
  if (Buf) return Buf.from(bytes).toString("base64");
  throw new Error("No base64 encoder available in this environment");
}

async function encryptViaNode(pem: string, plaintext: string): Promise<string> {
  const nodeCrypto =
    (await import("node:crypto")) as typeof import("node:crypto");
  const ciphertext = nodeCrypto.publicEncrypt(
    {
      key: pem,
      padding: nodeCrypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(plaintext, "utf8")
  );
  return ciphertext.toString("base64");
}

// --- Browser / WebCrypto path: manual PKCS1 v1.5 + raw RSA --- //

interface DerField {
  tag: number;
  valueStart: number;
  valueEnd: number;
}

function readDer(bytes: Uint8Array, offset: number): DerField {
  const tag = bytes[offset];
  if (tag === undefined) throw new Error("DER: unexpected end of input");
  let length = bytes[offset + 1];
  if (length === undefined) throw new Error("DER: unexpected end of input");
  let valueStart = offset + 2;
  if (length & 0x80) {
    const numLenBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < numLenBytes; i++) {
      const b = bytes[valueStart + i];
      if (b === undefined) throw new Error("DER: truncated length");
      length = (length << 8) | b;
    }
    valueStart += numLenBytes;
  }
  return { tag, valueStart, valueEnd: valueStart + length };
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = 0; i < bytes.length; i++) {
    n = (n << 8n) | BigInt(bytes[i]!);
  }
  return n;
}

function bigintToFixedBytes(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = n;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error("RSA: integer overflows modulus length");
  return out;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

function parseRsaSpki(pem: string): { n: bigint; e: bigint; k: number } {
  const spki = pemToSpki(pem);
  // SubjectPublicKeyInfo ::= SEQUENCE { AlgorithmIdentifier, BIT STRING }
  const outer = readDer(spki, 0);
  if (outer.tag !== 0x30)
    throw new Error("RSA: SPKI outer SEQUENCE tag missing");
  const algId = readDer(spki, outer.valueStart);
  if (algId.tag !== 0x30)
    throw new Error("RSA: AlgorithmIdentifier SEQUENCE tag missing");
  const bitString = readDer(spki, algId.valueEnd);
  if (bitString.tag !== 0x03) throw new Error("RSA: BIT STRING tag missing");
  // First byte of BIT STRING value is the unused-bit count (must be 0).
  if (spki[bitString.valueStart] !== 0)
    throw new Error("RSA: unsupported unused bits in BIT STRING");
  // Inside the BIT STRING: RSAPublicKey ::= SEQUENCE { INTEGER n, INTEGER e }
  const rsaSeq = readDer(spki, bitString.valueStart + 1);
  if (rsaSeq.tag !== 0x30)
    throw new Error("RSA: RSAPublicKey SEQUENCE tag missing");
  const nInt = readDer(spki, rsaSeq.valueStart);
  if (nInt.tag !== 0x02) throw new Error("RSA: modulus INTEGER tag missing");
  const eInt = readDer(spki, nInt.valueEnd);
  if (eInt.tag !== 0x02) throw new Error("RSA: exponent INTEGER tag missing");
  const n = bytesToBigint(spki.subarray(nInt.valueStart, nInt.valueEnd));
  const e = bytesToBigint(spki.subarray(eInt.valueStart, eInt.valueEnd));
  // PKCS1 ciphertext byte length equals byte length of modulus.
  const k = Math.ceil(n.toString(2).length / 8);
  return { n, e, k };
}

function getRandomBytes(length: number): Uint8Array {
  const g = (
    globalThis as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (g?.getRandomValues) {
    const out = new Uint8Array(length);
    g.getRandomValues(out);
    return out;
  }
  throw new Error("RSA: no crypto.getRandomValues available in this runtime");
}

// PKCS1 v1.5 type-2 encryption padding (RFC 8017 §7.2.1).
// EM = 0x00 || 0x02 || PS || 0x00 || M
// where PS is `k - mLen - 3` cryptographically-random non-zero bytes.
function pkcs1v15PadType2(message: Uint8Array, k: number): Uint8Array {
  if (message.length > k - 11)
    throw new Error(
      `RSA: plaintext too long for modulus (max ${k - 11} bytes, got ${message.length})`
    );
  const psLen = k - message.length - 3;
  const ps = new Uint8Array(psLen);
  let filled = 0;
  // Resample until every byte is non-zero (rejection sampling).
  while (filled < psLen) {
    const draw = getRandomBytes(psLen - filled);
    for (let i = 0; i < draw.length && filled < psLen; i++) {
      const b = draw[i]!;
      if (b !== 0) ps[filled++] = b;
    }
  }
  const em = new Uint8Array(k);
  em[0] = 0x00;
  em[1] = 0x02;
  em.set(ps, 2);
  em[2 + psLen] = 0x00;
  em.set(message, 3 + psLen);
  return em;
}

function encryptViaWebCrypto(pem: string, plaintext: string): string {
  const { n, e, k } = parseRsaSpki(pem);
  const message = new TextEncoder().encode(plaintext);
  const em = pkcs1v15PadType2(message, k);
  const m = bytesToBigint(em);
  if (m >= n) throw new Error("RSA: padded message >= modulus");
  const c = modPow(m, e, n);
  return base64Encode(bigintToFixedBytes(c, k));
}

/**
 * Encrypts `plaintext` with the aggregator's RSA public key (PEM, SPKI)
 * using PKCS1 v1.5 padding. Returns base64-encoded ciphertext that
 * Go's `crypto/rsa.DecryptPKCS1v15` (and other PKCS1 v1.5 decryptors)
 * can recover.
 */
export async function encryptRecipient(
  publicKeyPem: string,
  plaintext: string
): Promise<string> {
  // Validate and canonicalize the PEM up front so the error is consistent
  // across runtimes (node:crypto delegates to OpenSSL, which both produces
  // a different message and rejects non-canonical armor the BigInt path
  // would accept). Both code paths then receive the same clean PEM.
  const pem = canonicalizePem(publicKeyPem);
  // Pick the encryptor by runtime feature detection rather than catching
  // bundler-specific import errors (the exact string varies across Vite,
  // Webpack, Rollup, esbuild — matching them is brittle). Any host that
  // exposes `process.versions.node` is Node, Bun, or a Node-compat layer
  // (Deno --node-compat, etc.); everything else uses the BigInt path.
  const proc = (globalThis as { process?: { versions?: { node?: string } } })
    .process;
  if (typeof proc?.versions?.node === "string") {
    return encryptViaNode(pem, plaintext);
  }
  return encryptViaWebCrypto(pem, plaintext);
}
