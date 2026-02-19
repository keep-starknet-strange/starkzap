const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

/**
 * Validate and normalize an HTTP(S) URL.
 *
 * By default, plain `http://` is only allowed for localhost addresses.
 */
export function assertSafeHttpUrl(
  value: string,
  label: string,
  options: { allowInsecureLocalhost?: boolean } = {}
): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  const { allowInsecureLocalhost = true } = options;
  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const isLoopbackV6 = hostname === "::1" || hostname === "[::1]";
  const isLocalhost = LOCALHOST_HOSTNAMES.has(hostname) || isLoopbackV6;

  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error(`${label} must use http:// or https://`);
  }

  if (protocol === "http:" && !(allowInsecureLocalhost && isLocalhost)) {
    throw new Error(
      `${label} must use https:// (http:// is only allowed for localhost)`
    );
  }

  return parsed;
}
