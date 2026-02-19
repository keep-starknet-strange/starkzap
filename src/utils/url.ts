/**
 * Validate and normalize an HTTP(S) URL.
 */
export function assertSafeHttpUrl(value: string, label: string): URL {
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

  return parsed;
}
