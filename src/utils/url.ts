/** Options for {@link assertSafeHttpUrl}. */
export interface SafeHttpUrlOptions {
  /**
   * Accept plain `http://` on hosts other than loopback.
   *
   * Loopback (`localhost`, `127.0.0.0/8`, `[::1]`) is always
   * accepted, since traffic to it never leaves the machine. Anything else over
   * plain http is readable by everyone on the path, so it has to be asked for.
   */
  allowInsecureHttp?: boolean | undefined;
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    // `URL` canonicalises every IPv4 spelling to dotted quad before this runs.
    /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
    hostname === "[::1]"
  );
}

/**
 * Validate and normalize an HTTP(S) URL.
 *
 * Rejects every scheme but `http:` and `https:`, and rejects plain `http:` on a
 * non-loopback host unless `options.allowInsecureHttp` is set.
 */
export function assertSafeHttpUrl(
  value: string,
  label: string,
  options?: SafeHttpUrlOptions
): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  const protocol = parsed.protocol.toLowerCase();

  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error(`${label} must use http:// or https://`);
  }

  if (
    protocol === "http:" &&
    !options?.allowInsecureHttp &&
    !isLoopback(parsed.hostname)
  ) {
    throw new Error(
      `${label} uses plain http:// on a non-loopback host, so everything sent ` +
        "over it is readable in transit. Use https://, or set " +
        "`allowInsecureHttp: true` in the configuration that carries this URL " +
        "if this is a trusted network."
    );
  }

  return parsed;
}
