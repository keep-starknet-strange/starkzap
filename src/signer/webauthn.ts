import type { Signature } from "starknet";
import type { SignerInterface } from "./interface.js";

/** WebAuthn signature data */
export interface WebAuthnSignatureData {
  r: { low: string; high: string };
  s: { low: string; high: string };
  authenticatorData: string;
  clientDataJSON: string;
}

/** Parsed P-256 public key */
export interface P256Coordinates {
  x: { low: string; high: string };
  y: { low: string; high: string };
  salt: string;
}

/**
 * WebAuthn signer for Face ID / Touch ID authentication.
 * Uses the device's secure enclave - private key never leaves hardware.
 *
 * @example
 * ```typescript
 * // Create a new passkey
 * const { signer, credentialId, publicKey } = await WebAuthnSigner.create();
 *
 * // Save credentialId and publicKey to restore later
 * localStorage.setItem("passkey", JSON.stringify({ credentialId, publicKey }));
 *
 * // Restore from saved credential
 * const saved = JSON.parse(localStorage.getItem("passkey"));
 * const signer = WebAuthnSigner.get(saved);
 * ```
 */
export class WebAuthnSigner implements SignerInterface {
  private constructor(
    private readonly credentialId: Uint8Array,
    private readonly publicKeyBytes: Uint8Array,
    private readonly rpId: string
  ) {}

  /** Check if WebAuthn is supported in this browser */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.credentials;
  }

  /**
   * Create a new passkey. Triggers Face ID / Touch ID prompt.
   *
   * @param options - Optional configuration (all have sensible defaults)
   * @returns Signer and credential data to persist
   */
  static async create(options?: {
    /** Relying party ID (default: current hostname) */
    rpId?: string;
    /** Display name for the app (default: document title) */
    rpName?: string;
    /** Unique user ID (default: random UUID) */
    userId?: string;
    /** User display name (default: "User") */
    userName?: string;
  }) {
    if (!this.isSupported()) {
      throw new Error("WebAuthn is not supported in this browser");
    }

    const rpId = options?.rpId ?? window.location.hostname;
    const rpName = options?.rpName ?? (document.title || "App");
    const userId = options?.userId ?? crypto.randomUUID();
    const userName = options?.userName ?? "User";

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { id: rpId, name: rpName },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        timeout: 60000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error("Passkey creation was cancelled by user");
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const spki = response.getPublicKey();
    if (!spki) {
      throw new Error("Failed to get public key from authenticator");
    }

    const publicKeyBytes = new Uint8Array(spki).slice(26); // Skip SPKI header
    const credentialIdBytes = new Uint8Array(credential.rawId);

    return {
      signer: new WebAuthnSigner(credentialIdBytes, publicKeyBytes, rpId),
      credentialId: b64url.encode(credentialIdBytes),
      publicKey: hex.encode(publicKeyBytes),
    };
  }

  /**
   * Restore a signer from saved credential data.
   *
   * @param options - Saved credential data
   * @returns WebAuthnSigner instance
   */
  static get(options: {
    /** Base64url-encoded credential ID */
    credentialId: string;
    /** Hex-encoded public key */
    publicKey: string;
    /** Relying party ID (default: current hostname) */
    rpId?: string;
  }): WebAuthnSigner {
    const rpId = options.rpId ?? window.location.hostname;
    return new WebAuthnSigner(
      b64url.decode(options.credentialId),
      hex.decode(options.publicKey),
      rpId
    );
  }

  /** Get hex-encoded public key (65 bytes: 04 || x || y) */
  async getPubKey(): Promise<string> {
    return hex.encode(this.publicKeyBytes);
  }

  /** Get parsed public key coordinates for Starknet u256 format */
  getParsedPublicKey(): P256Coordinates {
    const x = this.publicKeyBytes.slice(1, 33);
    const y = this.publicKeyBytes.slice(33);
    const xLow = hex.encode(x.slice(16));
    return {
      x: { low: xLow, high: hex.encode(x.slice(0, 16)) },
      y: { low: hex.encode(y.slice(16)), high: hex.encode(y.slice(0, 16)) },
      salt: xLow,
    };
  }

  /**
   * Sign a hash with Face ID / Touch ID.
   * Returns structured signature data for easy access.
   */
  async sign(hash: string): Promise<WebAuthnSignatureData> {
    const raw = await this.signInternal(hash);
    return {
      r: {
        low: hex.encode(raw.r.slice(16)),
        high: hex.encode(raw.r.slice(0, 16)),
      },
      s: {
        low: hex.encode(raw.s.slice(16)),
        high: hex.encode(raw.s.slice(0, 16)),
      },
      authenticatorData: hex.encode(raw.authenticatorData),
      clientDataJSON: hex.encode(raw.clientDataJSON),
    };
  }

  /**
   * Sign a hash (SignerInterface implementation).
   * Returns flat array: [r.low, r.high, s.low, s.high, authenticatorData, clientDataJSON]
   */
  async signRaw(hash: string): Promise<Signature> {
    const sig = await this.sign(hash);
    return [
      sig.r.low,
      sig.r.high,
      sig.s.low,
      sig.s.high,
      sig.authenticatorData,
      sig.clientDataJSON,
    ];
  }

  private async signInternal(hash: string) {
    const challenge = hex.decode(hash);

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        rpId: this.rpId,
        allowCredentials: [
          { type: "public-key", id: this.credentialId.buffer as ArrayBuffer },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error("Authentication was cancelled by user");
    }

    const res = assertion.response as AuthenticatorAssertionResponse;
    const { r, s } = parseDer(new Uint8Array(res.signature));

    return {
      r,
      s,
      authenticatorData: new Uint8Array(res.authenticatorData),
      clientDataJSON: new Uint8Array(res.clientDataJSON),
    };
  }
}

/** Parse P-256 public key string into Starknet u256 coordinates */
export function parseP256PublicKey(pubKey: string): P256Coordinates {
  const bytes = hex.decode(pubKey);
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      "Invalid P-256 public key: expected 65 bytes starting with 0x04"
    );
  }
  const x = bytes.slice(1, 33);
  const y = bytes.slice(33);
  const xLow = hex.encode(x.slice(16));
  return {
    x: { low: xLow, high: hex.encode(x.slice(0, 16)) },
    y: { low: hex.encode(y.slice(16)), high: hex.encode(y.slice(0, 16)) },
    salt: xLow,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const hex = {
  encode: (b: Uint8Array) =>
    "0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join(""),
  decode: (s: string) => {
    const h = s.replace(/^0x/, "");
    return new Uint8Array(h.length / 2).map((_, i) =>
      parseInt(h.substr(i * 2, 2), 16)
    );
  },
};

const b64url = {
  encode: (b: Uint8Array) =>
    btoa(String.fromCharCode(...b))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, ""),
  decode: (s: string) => {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(
      atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)),
      (c) => c.charCodeAt(0)
    );
  },
};

function parseDer(der: Uint8Array) {
  const rLen = der[3]!,
    sLen = der[5 + rLen]!;
  return {
    r: pad32(der.slice(4, 4 + rLen)),
    s: pad32(der.slice(6 + rLen, 6 + rLen + sLen)),
  };
}

function pad32(b: Uint8Array): Uint8Array {
  if (b.length === 33 && b[0] === 0) b = b.slice(1);
  if (b.length === 32) return new Uint8Array(b);
  const out = new Uint8Array(32);
  out.set(b, 32 - b.length);
  return out;
}
