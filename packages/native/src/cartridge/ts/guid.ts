import { ec, encode, hash, num, shortString } from "starknet";
import { SessionProtocolError } from "@/cartridge/ts/errors";

const STARKNET_SIGNER_DOMAIN = num
  .toHex(shortString.encodeShortString("Starknet Signer"))
  .toLowerCase();

export function deriveSessionSignerGuid(privateKey: string): string {
  const normalizedPrivateKey = String(privateKey ?? "").trim();
  if (!normalizedPrivateKey) {
    throw new SessionProtocolError(
      "Cannot derive session GUID from empty key."
    );
  }

  try {
    const normalizedHex = encode.addHexPrefix(normalizedPrivateKey);
    const publicKey = ec.starkCurve.getStarkKey(normalizedHex);
    return num
      .toHex(hash.computePoseidonHash(STARKNET_SIGNER_DOMAIN, publicKey))
      .toLowerCase();
  } catch (error) {
    throw new SessionProtocolError(
      "Failed to derive Cartridge session GUID.",
      error
    );
  }
}
