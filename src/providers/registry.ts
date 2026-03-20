/** Minimal constraint: every provider must expose a stable string id. */
export interface Identifiable {
  readonly id: string;
}

/**
 * Generic, type-safe provider registry used by Swap, DCA, and Lending modules.
 *
 * Handles registration, default selection, lookup, and listing — the logic
 * that was previously duplicated across three separate implementations.
 */
export class ProviderRegistry<T extends Identifiable> {
  private readonly providers = new Map<string, T>();
  private defaultId: string | null = null;

  constructor(private readonly domain: string) {}

  /** Register a provider. Optionally make it the default. */
  register(provider: T, makeDefault = false): void {
    this.providers.set(provider.id, provider);
    if (makeDefault || this.defaultId == null) {
      this.defaultId = provider.id;
    }
  }

  /** Set the default provider by id. Throws if the id is not registered. */
  setDefault(id: string): void {
    this.get(id); // validates existence
    this.defaultId = id;
  }

  /** Look up a provider by id. Throws if not found. */
  get(id: string): T {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(
        `Unknown ${this.domain} provider "${id}". Registered providers: ${this.list().join(", ")}`
      );
    }
    return provider;
  }

  /** Return the default provider. Throws if none is configured. */
  getDefault(): T {
    if (!this.defaultId) {
      throw new Error(`No default ${this.domain} provider configured`);
    }
    return this.get(this.defaultId);
  }

  /** List all registered provider ids. */
  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
