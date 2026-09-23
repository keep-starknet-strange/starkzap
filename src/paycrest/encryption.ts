/**
 * RSA PKCS1 v1.5 encryption for Paycrest recipient details (gateway path).
 *
 * The Paycrest aggregator decrypts `message_hash` with Go's
 * `crypto/rsa.DecryptPKCS1v15`, so the SDK must encrypt with the matching
 * PKCS1 v1.5 padding (NOT OAEP — those are incompatible at the byte level).
 *
 * Runtime auto-detection (see {@link tryLoadNodeCrypto}):
 *   - Node / Bun / SSR / Deno-with-Node-shim: `node:crypto.publicEncrypt`
 *     with `RSA_PKCS1_PADDING`.
 *   - True browsers / RN / Workers (no `node:crypto`): the optional
 *     `node-forge` peer dependency, which implements RSAES-PKCS1-V1_5.
 *     WebCrypto's `subtle.encrypt` only supports OAEP for RSA, which the
 *     aggregator can't decrypt, so a userland implementation is required
 *     there. `node-forge` is a vetted library — we no longer hand-roll the
 *     DER parsing / modular exponentiation / PKCS1 padding.
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
 * its output means both the strict OpenSSL-backed Node path and the
 * `node-forge` path receive identical, clean input. Doubles as validation
 * — throws on a malformed PEM.
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

/**
 * Attempt to load `node:crypto`. Resolves to the module on Node-like
 * runtimes (Node, Bun, Deno `--node-compat`, SSR) and to `null` in true
 * browsers / RN / Workers — or wherever a bundler stubs the import.
 *
 * This replaces the previous `process.versions.node` sniff: runtimes can
 * fake `process`, but a working `node:crypto.publicEncrypt` is the actual
 * capability we depend on, so we probe for it directly.
 */
async function tryLoadNodeCrypto(): Promise<
  typeof import("node:crypto") | null
> {
  try {
    return await import("node:crypto");
  } catch {
    return null;
  }
}

function encryptViaNode(
  nodeCrypto: typeof import("node:crypto"),
  pem: string,
  plaintext: string
): string {
  const ciphertext = nodeCrypto.publicEncrypt(
    {
      key: pem,
      padding: nodeCrypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(plaintext, "utf8")
  );
  return ciphertext.toString("base64");
}

/**
 * Browser / React Native / Workers path. Uses the optional `node-forge`
 * peer dependency to perform RSAES-PKCS1-V1_5 encryption (the same padding
 * scheme Go's `DecryptPKCS1v15` expects). Exported for direct testing of
 * the non-Node path without having to defeat the runtime probe.
 *
 * @throws if `node-forge` is not installed — with an actionable message.
 */
export async function encryptViaForge(
  pem: string,
  plaintext: string
): Promise<string> {
  type ForgeModule = typeof import("node-forge");
  let mod: unknown;
  try {
    mod = await import("node-forge");
  } catch {
    throw new Error(
      "Paycrest recipient encryption requires the optional `node-forge` " +
        "dependency on this runtime (no node:crypto available). Install it " +
        "with `npm install node-forge` — it is declared as an optional peer " +
        "dependency."
    );
  }
  // node-forge is CommonJS (`export =`); under ESM the namespace may carry
  // the library on `.default`. Tolerate both interop shapes.
  const forge = ((mod as { default?: ForgeModule }).default ??
    mod) as ForgeModule;
  const publicKey = forge.pki.publicKeyFromPem(pem);
  const encrypted = publicKey.encrypt(
    forge.util.encodeUtf8(plaintext),
    "RSAES-PKCS1-V1_5"
  );
  return forge.util.encode64(encrypted);
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
  // a different message and rejects non-canonical armor that node-forge
  // would accept). Both code paths then receive the same clean PEM.
  const pem = canonicalizePem(publicKeyPem);
  const nodeCrypto = await tryLoadNodeCrypto();
  if (nodeCrypto && typeof nodeCrypto.publicEncrypt === "function") {
    return encryptViaNode(nodeCrypto, pem, plaintext);
  }
  return encryptViaForge(pem, plaintext);
}
