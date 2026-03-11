import { ec, encode, hash, num } from "starknet";
import { SessionProtocolError } from "@/cartridge/ts/errors";

const SESSION_SIGNER_DOMAIN = num.toHex(hash.starknetKeccak("session_signer"));

export function deriveSessionSignerGuid(privateKey: string): string {
  const normalizedPrivateKey = String(privateKey ?? "").trim();
  if (!normalizedPrivateKey) {
    throw new SessionProtocolError(
      "Cannot derive session GUID from empty key."
    );
  }

  let normalizedHex = normalizedPrivateKey;
  try {
    normalizedHex = encode.addHexPrefix(normalizedPrivateKey);
    const publicKey = ec.starkCurve.getStarkKey(normalizedHex);
    return num
      .toHex(
        hash.computePoseidonHashOnElements([SESSION_SIGNER_DOMAIN, publicKey])
      )
      .toLowerCase();
  } catch (error) {
    throw new SessionProtocolError(
      "Failed to derive Cartridge session GUID.",
      error
    );
  }
}
