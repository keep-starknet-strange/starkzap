// @ts-expect-error - moduleResolution bundler doesn't resolve subpath exports
import { secp256k1 } from "@noble/curves/secp256k1";
import { hexToBytes } from "@noble/curves/utils.js";
import { uint256, num, type Signature } from "starknet";
import type { SignerInterface } from "@/signer/interface";

/**
 * Convert Uint8Array to bigint (big-endian).
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
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

    // Pad to 32 bytes (64 hex chars) if needed
    this.privateKey = hexToBytes(key);
    this.publicKey = secp256k1
      .getPublicKey(this.privateKey, false)
      .toString("hex");
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
    const hashBytes = hexToBytes(hash.startsWith("0x") ? hash.slice(2) : hash);

    // Sign with recovery format to get recovery byte
    const sigBytes = secp256k1.sign(hashBytes, this.privateKey, {
      lowS: true,
      prehash: false,
      format: "recovered",
    });

    // Parse the recovered signature (65 bytes)
    // Format: recovery (1 byte) + r (32 bytes) + s (32 bytes)
    const recoveryRaw = sigBytes[0];

    // Normalize recovery to 0 or 1 (handle both raw and Ethereum v=27/28 conventions)
    const recovery = recoveryRaw >= 27 ? recoveryRaw - 27 : recoveryRaw;

    // Convert r and s bytes to bigint
    const rBigInt = bytesToBigInt(sigBytes.slice(1, 33));
    const sBigInt = bytesToBigInt(sigBytes.slice(33, 65));

    // Split r and s into u256 format - bnToUint256 returns hex strings at runtime
    const r = uint256.bnToUint256(rBigInt);
    const s = uint256.bnToUint256(sBigInt);

    // Return as hex strings (cast needed because TS types say BigNumberish)
    return [
      r.low as string,
      r.high as string,
      s.low as string,
      s.high as string,
      num.toHex(recovery),
    ];
  }
}
