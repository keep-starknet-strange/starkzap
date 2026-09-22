const MAX_AUTHORIZATION_SIGNATURE_LENGTH = 1_024;
const HASH_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;
const STANDARD_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const STATUS_BAD_REQUEST = 400;
const STATUS_FORBIDDEN = 403;

export class PrivySigningRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "PrivySigningRequestError";
  }
}

export function resolvePrivySigningRequest(
  body: unknown,
  authenticatedWalletId: string,
  verifiedAccessToken: string
) {
  const requestBody =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const { walletId, hash, authorizationSignature } = requestBody;

  if (typeof hash !== "string" || !HASH_PATTERN.test(hash)) {
    throw new PrivySigningRequestError(
      STATUS_BAD_REQUEST,
      "hash must be 0x-prefixed hex of at most 32 bytes"
    );
  }
  let authorizationContext: { signatures: string[] } | { user_jwts: string[] };
  if (authorizationSignature === undefined) {
    authorizationContext = { user_jwts: [verifiedAccessToken] };
  } else {
    if (
      typeof authorizationSignature !== "string" ||
      authorizationSignature.length === 0 ||
      authorizationSignature.length > MAX_AUTHORIZATION_SIGNATURE_LENGTH ||
      !STANDARD_BASE64_PATTERN.test(authorizationSignature)
    ) {
      throw new PrivySigningRequestError(
        STATUS_BAD_REQUEST,
        `authorizationSignature must be non-empty base64 up to ${MAX_AUTHORIZATION_SIGNATURE_LENGTH} characters`
      );
    }
    authorizationContext = { signatures: [authorizationSignature] };
  }
  if (walletId !== undefined && walletId !== authenticatedWalletId) {
    throw new PrivySigningRequestError(
      STATUS_FORBIDDEN,
      "walletId does not belong to the authenticated user"
    );
  }

  return {
    hash,
    authorizationContext,
  };
}
