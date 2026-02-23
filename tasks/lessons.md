# Lessons

- 2026-02-23: Do not use Perl replacement strings with unescaped `@` inside double-quoted shell commands. Use single-quoted commands or escape `@` (`\@`) to avoid mangling scoped npm package names (e.g., `@starkware-ecosystem/starkzap` becoming `-ecosystem/starkzap`).
- 2026-02-23: For mobile runtime error handling paths, avoid assuming `error.message` is always a string and avoid direct template interpolation of unknown errors. Always normalize errors through a defensive helper (`try/catch`, string coercion fallback) before logging or classification.
- 2026-02-23: For JSON-RPC proxies, do not rely on HTTP status alone. Log and classify JSON-RPC envelope fields (`result`/`error`) even on HTTP `200`, and include sanitized request/response metadata (headers, method, ids, timing) so upstream failures are diagnosable.
- 2026-02-23: Keep example-app resilience mechanisms behind explicit product intent. If the user asks to remove fallback behavior, delete the retry/fallback path fully (helper + call-site logic + fallback logs) instead of partially disabling it.
