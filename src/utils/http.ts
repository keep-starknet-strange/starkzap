/**
 * Shared `fetch` + timeout + abort plumbing used by the HTTP clients in
 * this SDK (the Paycrest REST client and the Privy remote signer).
 *
 * The two clients differ in how they parse responses (envelope
 * unwrapping vs raw JSON) and in their error messages, so the response
 * handling is delegated to a `parse` callback. The shared part — wiring
 * an `AbortController` to a timeout, optionally forwarding a caller's
 * `AbortSignal`, and mapping `AbortError` to a caller-supplied message —
 * lives here. The timeout stays armed across `parse`, so a hung body
 * read is cancelled too, not just a hung connection.
 */
export interface FetchJsonWithTimeoutOptions {
  /** `fetch` implementation to use (injectable for tests / custom runtimes). */
  fetchImpl: typeof fetch;
  /** Abort the request after this many milliseconds. */
  timeoutMs: number;
  /** Optional caller signal; aborting it cancels the in-flight request. */
  callerSignal?: AbortSignal;
  /** Build the error thrown when the timeout fires. */
  onTimeout: () => Error;
  /**
   * Build the error thrown when the *caller's* signal aborted (as opposed
   * to the timeout). Falls back to `onTimeout` when omitted.
   */
  onCallerAbort?: () => Error;
}

/**
 * Run `fetchImpl(url, init)` under a timeout (and optional caller abort),
 * then hand the `Response` to `parse` while the timeout is still armed.
 * `AbortError` is translated via `onCallerAbort` / `onTimeout`; any other
 * error (including those thrown by `parse`) propagates unchanged.
 */
export async function fetchJsonWithTimeout<T>(
  url: string | URL,
  init: RequestInit,
  options: FetchJsonWithTimeoutOptions,
  parse: (res: Response) => Promise<T>
): Promise<T> {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  // Forward an external abort onto our internal controller so the
  // in-flight fetch is cancelled immediately rather than waiting for the
  // timeout to elapse.
  let onCallerAbort: (() => void) | undefined;
  if (controller && options.callerSignal) {
    if (options.callerSignal.aborted) {
      controller.abort();
    } else {
      onCallerAbort = () => controller.abort();
      options.callerSignal.addEventListener("abort", onCallerAbort, {
        once: true,
      });
    }
  }

  try {
    const requestInit: RequestInit = { ...init };
    if (controller) requestInit.signal = controller.signal;
    const res = await options.fetchImpl(url, requestInit);
    return await parse(res);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (options.callerSignal?.aborted && options.onCallerAbort) {
        throw options.onCallerAbort();
      }
      throw options.onTimeout();
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (options.callerSignal && onCallerAbort) {
      options.callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}
