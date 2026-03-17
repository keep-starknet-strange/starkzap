// Native fallback: return the client value directly since native has no SSR/build-time render split.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  return client;
}
