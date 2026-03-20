import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "@/providers/registry";

interface FakeProvider {
  readonly id: string;
  value: number;
}

function makeProvider(id: string, value = 0): FakeProvider {
  return { id, value };
}

describe("ProviderRegistry", () => {
  it("sets the first registered provider as default automatically", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    const p = makeProvider("alpha");
    registry.register(p);

    expect(registry.getDefault()).toBe(p);
  });

  it("does not override default when registering additional providers", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    const first = makeProvider("first");
    const second = makeProvider("second");
    registry.register(first);
    registry.register(second);

    expect(registry.getDefault()).toBe(first);
  });

  it("overrides default when makeDefault is true", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    registry.register(makeProvider("first"));
    const override = makeProvider("override");
    registry.register(override, true);

    expect(registry.getDefault()).toBe(override);
  });

  it("returns the correct provider by id", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    const a = makeProvider("a", 1);
    const b = makeProvider("b", 2);
    registry.register(a);
    registry.register(b);

    expect(registry.get("a")).toBe(a);
    expect(registry.get("b")).toBe(b);
  });

  it("throws on unknown provider id with registered list", () => {
    const registry = new ProviderRegistry<FakeProvider>("swap");
    registry.register(makeProvider("ekubo"));
    registry.register(makeProvider("avnu"));

    expect(() => registry.get("unknown")).toThrow(
      'Unknown swap provider "unknown". Registered providers: ekubo, avnu'
    );
  });

  it("setDefault validates the provider exists", () => {
    const registry = new ProviderRegistry<FakeProvider>("DCA");
    registry.register(makeProvider("avnu"));

    expect(() => registry.setDefault("missing")).toThrow(
      'Unknown DCA provider "missing"'
    );
  });

  it("setDefault changes the default provider", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    const a = makeProvider("a");
    const b = makeProvider("b");
    registry.register(a);
    registry.register(b);
    registry.setDefault("b");

    expect(registry.getDefault()).toBe(b);
  });

  it("getDefault throws when no providers are registered", () => {
    const registry = new ProviderRegistry<FakeProvider>("lending");

    expect(() => registry.getDefault()).toThrow(
      "No default lending provider configured"
    );
  });

  it("list returns all registered provider ids", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    registry.register(makeProvider("x"));
    registry.register(makeProvider("y"));
    registry.register(makeProvider("z"));

    expect(registry.list()).toEqual(["x", "y", "z"]);
  });

  it("list returns empty array when no providers registered", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    expect(registry.list()).toEqual([]);
  });

  it("re-registering same id replaces the provider", () => {
    const registry = new ProviderRegistry<FakeProvider>("test");
    registry.register(makeProvider("a", 1));
    const replacement = makeProvider("a", 2);
    registry.register(replacement);

    expect(registry.get("a")).toBe(replacement);
    expect(registry.get("a").value).toBe(2);
    expect(registry.list()).toEqual(["a"]);
  });
});
