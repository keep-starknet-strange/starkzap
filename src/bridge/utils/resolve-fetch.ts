export function resolveFetch(fetchFn?: typeof fetch): typeof fetch {
  if (fetchFn) {
    return fetchFn;
  } else if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis) as typeof fetch;
  } else {
    throw new Error(
      "No fetch implementation available. Provide a fetchFn option."
    );
  }
}
