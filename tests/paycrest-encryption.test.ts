import { describe, expect, it } from "vitest";
import nodeCrypto from "node:crypto";
import { encryptRecipient } from "@/paycrest";

describe("paycrest encryption (RSA PKCS1 v1.5)", () => {
  it("encrypts a plaintext that decrypts via the matching private key", async () => {
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

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

    const decrypted = nodeCrypto.privateDecrypt(
      {
        key: privateKey,
        padding: nodeCrypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(base64Ciphertext, "base64")
    );
    expect(decrypted.toString("utf8")).toBe(plaintext);
  });

  it("throws on a malformed PEM (no BEGIN PUBLIC KEY armor)", async () => {
    await expect(encryptRecipient("not-a-pem", "hello")).rejects.toThrow(
      /PEM/i
    );
  });

  it("uses the browser BigInt fallback when process.versions.node is absent", async () => {
    // Simulate a true browser/RN/Workers environment by hiding
    // process.versions.node. The encryptor should switch to the
    // BigInt-based PKCS1 v1.5 path and still produce ciphertext
    // the matching private key can decrypt. Guards against the
    // bundler-specific error-message-matching the old fallback
    // depended on (Webpack, Vite, Rollup each emit different strings).
    const g = globalThis as { process?: unknown };
    const original = g.process;
    g.process = undefined;
    try {
      const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const plaintext = "browser-path roundtrip";
      const base64Ciphertext = await encryptRecipient(publicKey, plaintext);
      const decrypted = nodeCrypto.privateDecrypt(
        {
          key: privateKey,
          padding: nodeCrypto.constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(base64Ciphertext, "base64")
      );
      expect(decrypted.toString("utf8")).toBe(plaintext);
    } finally {
      g.process = original;
    }
  });

  it("produces different ciphertext for the same plaintext (random PKCS1 padding)", async () => {
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const plaintext = "same-plaintext";
    const a = await encryptRecipient(publicKey, plaintext);
    const b = await encryptRecipient(publicKey, plaintext);
    expect(a).not.toBe(b);
    for (const ct of [a, b]) {
      const decrypted = nodeCrypto.privateDecrypt(
        { key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(ct, "base64")
      );
      expect(decrypted.toString("utf8")).toBe(plaintext);
    }
  });

  it("round-trips a PEM with CRLF line endings, leading whitespace, and indentation", async () => {
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    // Leading whitespace + CRLF line endings + per-line indentation.
    // pemToSpki strips all of it before decoding.
    const indent = " ".repeat(3);
    const mangled = `${indent}\n` + publicKey.replace(/\n/g, `\r\n${indent}`);
    const plaintext = "whitespace-tolerant";
    const ct = await encryptRecipient(mangled, plaintext);
    const decrypted = nodeCrypto.privateDecrypt(
      { key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(ct, "base64")
    );
    expect(decrypted.toString("utf8")).toBe(plaintext);
  });

  it("throws on corrupt base64 inside valid BEGIN/END armor", async () => {
    const { publicKey } = nodeCrypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    // Inject an invalid base64 character into the key body.
    const lines = publicKey.trim().split("\n");
    lines[1] = "!!!!" + (lines[1] ?? "");
    const corrupt = lines.join("\n");
    await expect(encryptRecipient(corrupt, "hello")).rejects.toThrow();
  });

  describe("browser BigInt path (process.versions.node hidden)", () => {
    function withoutNodeProcess<T>(fn: () => Promise<T>): Promise<T> {
      const g = globalThis as { process?: unknown };
      const original = g.process;
      g.process = undefined;
      return fn().finally(() => {
        g.process = original;
      });
    }

    it("throws when plaintext exceeds the modulus capacity (k - 11 bytes)", async () => {
      const { publicKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      // 2048-bit modulus => k = 256, max plaintext = 245 bytes.
      const tooLong = "a".repeat(246);
      await withoutNodeProcess(async () => {
        await expect(encryptRecipient(publicKey, tooLong)).rejects.toThrow(
          /too long/i
        );
      });
    });

    it("handles a non-2048 (3072-bit) modulus", async () => {
      const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", {
        modulusLength: 3072,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const plaintext = "3072-bit roundtrip";
      const ct = await withoutNodeProcess(() =>
        encryptRecipient(publicKey, plaintext)
      );
      const decrypted = nodeCrypto.privateDecrypt(
        { key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(ct, "base64")
      );
      expect(decrypted.toString("utf8")).toBe(plaintext);
    });
  });
});
