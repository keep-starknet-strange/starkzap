import { describe, expect, it } from "vitest";
import nodeCrypto from "node:crypto";
import { encryptRecipient, encryptViaForge } from "@/paycrest/encryption";

/**
 * Decrypt a PKCS1 v1.5 (type 2) ciphertext using raw RSA + manual unwrap.
 *
 * Newer OpenSSL (Node 22+/24, OpenSSL 3.2+) refuses
 * `privateDecrypt(..., { padding: RSA_PKCS1_PADDING })` by default as a
 * Bleichenbacher mitigation — it throws instead of returning the message.
 * Production never decrypts (the SDK only encrypts), so this only affects
 * test verification. We decrypt raw (`RSA_NO_PADDING`) and strip the
 * PKCS1 v1.5 padding ourselves: EM = 0x00 || 0x02 || PS || 0x00 || M.
 */
function decryptPkcs1v15(
  privateKey: nodeCrypto.KeyLike,
  base64Ciphertext: string
): Buffer {
  const em = nodeCrypto.privateDecrypt(
    { key: privateKey, padding: nodeCrypto.constants.RSA_NO_PADDING },
    Buffer.from(base64Ciphertext, "base64")
  );
  // Tolerate runtimes that strip the leading 0x00 of the integer.
  let i = em[0] === 0x00 ? 1 : 0;
  if (em[i] !== 0x02) {
    throw new Error("Invalid PKCS1 v1.5 block (expected block type 0x02)");
  }
  i++;
  let sep = i;
  while (sep < em.length && em[sep] !== 0x00) sep++;
  if (sep >= em.length) {
    throw new Error("Invalid PKCS1 v1.5 block (no 0x00 separator)");
  }
  return em.subarray(sep + 1);
}

function generateKeyPair(modulusLength = 2048) {
  return nodeCrypto.generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

describe("paycrest encryption (RSA PKCS1 v1.5)", () => {
  it("encrypts a plaintext that decrypts via the matching private key", async () => {
    const { publicKey, privateKey } = generateKeyPair();

    const plaintext = JSON.stringify({
      institution: "GTBINGLA",
      accountIdentifier: "1234567890",
      accountName: "Test User",
      metadata: { apiKey: "test-key" },
    });

    const base64Ciphertext = await encryptRecipient(publicKey, plaintext);
    expect(typeof base64Ciphertext).toBe("string");
    expect(base64Ciphertext.length).toBeGreaterThan(0);
    expect(base64Ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);

    const decrypted = decryptPkcs1v15(privateKey, base64Ciphertext);
    expect(decrypted.toString("utf8")).toBe(plaintext);
  });

  it("throws on a malformed PEM (no BEGIN PUBLIC KEY armor)", async () => {
    await expect(encryptRecipient("not-a-pem", "hello")).rejects.toThrow(
      /PEM/i
    );
  });

  it("produces different ciphertext for the same plaintext (random PKCS1 padding)", async () => {
    const { publicKey, privateKey } = generateKeyPair();
    const plaintext = "same-plaintext";
    const a = await encryptRecipient(publicKey, plaintext);
    const b = await encryptRecipient(publicKey, plaintext);
    expect(a).not.toBe(b);
    for (const ct of [a, b]) {
      expect(decryptPkcs1v15(privateKey, ct).toString("utf8")).toBe(plaintext);
    }
  });

  it("round-trips a PEM with CRLF line endings, leading whitespace, and indentation", async () => {
    const { publicKey, privateKey } = generateKeyPair();
    // Leading whitespace + CRLF line endings + per-line indentation.
    // pemToSpki strips all of it before decoding.
    const indent = " ".repeat(3);
    const mangled = `${indent}\n` + publicKey.replace(/\n/g, `\r\n${indent}`);
    const plaintext = "whitespace-tolerant";
    const ct = await encryptRecipient(mangled, plaintext);
    expect(decryptPkcs1v15(privateKey, ct).toString("utf8")).toBe(plaintext);
  });

  it("throws on corrupt base64 inside valid BEGIN/END armor", async () => {
    const { publicKey } = generateKeyPair();
    // Inject an invalid base64 character into the key body.
    const lines = publicKey.trim().split("\n");
    lines[1] = "!!!!" + (lines[1] ?? "");
    const corrupt = lines.join("\n");
    await expect(encryptRecipient(corrupt, "hello")).rejects.toThrow();
  });

  // The browser / React Native path uses the optional `node-forge` peer
  // dependency rather than `node:crypto`. We exercise it directly via
  // `encryptViaForge` (the runtime probe always picks node:crypto under
  // vitest, so we can't reach the branch by hiding globals).
  describe("browser path (node-forge)", () => {
    it("produces ciphertext the matching private key can decrypt", async () => {
      const { publicKey, privateKey } = generateKeyPair();
      const plaintext = "browser-path roundtrip";
      const ct = await encryptViaForge(publicKey, plaintext);
      expect(decryptPkcs1v15(privateKey, ct).toString("utf8")).toBe(plaintext);
    });

    it("interops with the Node path (both decrypt to the same plaintext)", async () => {
      const { publicKey, privateKey } = generateKeyPair();
      const plaintext = JSON.stringify({ institution: "GTBINGLA", x: 1 });
      const viaForge = await encryptViaForge(publicKey, plaintext);
      const viaNode = await encryptRecipient(publicKey, plaintext);
      expect(decryptPkcs1v15(privateKey, viaForge).toString("utf8")).toBe(
        plaintext
      );
      expect(decryptPkcs1v15(privateKey, viaNode).toString("utf8")).toBe(
        plaintext
      );
    });

    it("handles a non-2048 (3072-bit) modulus", async () => {
      const { publicKey, privateKey } = generateKeyPair(3072);
      const plaintext = "3072-bit roundtrip";
      const ct = await encryptViaForge(publicKey, plaintext);
      expect(decryptPkcs1v15(privateKey, ct).toString("utf8")).toBe(plaintext);
    });

    it("throws when plaintext exceeds the modulus capacity", async () => {
      const { publicKey } = generateKeyPair();
      // 2048-bit modulus => max PKCS1 v1.5 plaintext = 245 bytes.
      const tooLong = "a".repeat(246);
      await expect(encryptViaForge(publicKey, tooLong)).rejects.toThrow();
    });
  });
});
