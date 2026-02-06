import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { uint256, num, type Signature } from "starknet";
import type { SignerInterface } from "@/signer/interface";

/**
 * Normalize a Starknet message hash into a 32-byte hex string for secp256k1 signing.
 */
function normalizeHashHex(hash: string): string {
  let normalized = hash.trim();
  if (normalized.startsWith("0x") || normalized.startsWith("0X")) {
    normalized = normalized.slice(2);
  }

  if (!normalized) {
    throw new Error("Invalid hash: empty value");
  }

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error("Invalid hash: must be hexadecimal");
  }

  // noble requires even-length hex.
  if (normalized.length % 2 !== 0) {
    normalized = `0${normalized}`;
  }

  // Starknet hashes fit in 251 bits, so 32-byte padding is expected.
  if (normalized.length > 64) {
    throw new Error("Invalid hash: expected at most 32 bytes");
  }

  return normalized.padStart(64, "0").toLowerCase();
}

/**
 * Ethereum (secp256k1) signer for Starknet.
 *
 * This signer uses Ethereum-style signatures for accounts that
 * support secp256k1 verification (like OpenZeppelin Ethereum accounts).
 *
 * @example
 * ```ts
 * const signer = new EthSigner("0xETH_PRIVATE_KEY");
 * const wallet = await sdk.connectWallet({
 *   account: { signer, accountClass: OpenZeppelinEthPreset }
 * });
 * ```
 */
export class EthSigner implements SignerInterface {
  private readonly privateKey: Uint8Array;
  private readonly publicKey: string;

  constructor(privateKey: string) {
    // Validate and normalize private key
    let key = privateKey.trim();
    if (key.startsWith("0x")) {
      key = key.slice(2);
    }

    // Validate hex characters
    if (!/^[0-9a-fA-F]+$/.test(key)) {
      throw new Error(
        "Invalid private key: must contain only hexadecimal characters"
      );
    }

    // Require exactly 32 bytes (64 hex chars)
    if (key.length !== 64) {
      throw new Error(
        "Invalid private key length: expected 32 bytes (64 hex chars)"
      );
    }

    this.privateKey = hexToBytes(key);
    const uncompressed = secp256k1.getPublicKey(this.privateKey, false);
    const x = "0x" + bytesToHex(uncompressed.slice(1, 33));
    const y = "0x" + bytesToHex(uncompressed.slice(33, 65));
    this.publicKey = JSON.stringify({ x, y });
  }

  /**
   * Get the full secp256k1 public key as JSON.
   * Returns `{"x":"0x...","y":"0x..."}` for use with OZ EthAccount.
   */
  async getPubKey(): Promise<string> {
    return this.publicKey;
  }

  /**
   * Sign a hash using secp256k1 with recovery.
   * Returns signature for OZ Ethereum account: [r_low, r_high, s_low, s_high, y_parity]
   * where r and s are u256 (split into 128-bit low/high parts)
   */
  async signRaw(hash: string): Promise<Signature> {
    // Convert hash to bytes (32 bytes)
    const hashBytes = hexToBytes(normalizeHashHex(hash));

    // Sign with recovery data for OZ Ethereum account signature format.
    const signature = secp256k1.sign(hashBytes, this.privateKey, {
      lowS: true,
      prehash: false,
      format: "recovered",
    });

    // Split r and s into u256 format.
    const r = uint256.bnToUint256(signature.r);
    const s = uint256.bnToUint256(signature.s);
    const recovery = signature.recovery;

    // Return as hex strings
    return [
      num.toHex(r.low),
      num.toHex(r.high),
      num.toHex(s.low),
      num.toHex(s.high),
      num.toHex(recovery),
    ];
  }
}
