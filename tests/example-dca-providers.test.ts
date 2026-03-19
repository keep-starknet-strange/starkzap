import { describe, expect, it } from "vitest";
import { getDcaProviders } from "../examples/shared/dca";

describe("example DCA providers", () => {
  it("register the expected recurring-order backends", () => {
    expect(getDcaProviders().map((provider) => provider.id)).toEqual([
      "avnu",
      "ekubo",
    ]);
  });
});
