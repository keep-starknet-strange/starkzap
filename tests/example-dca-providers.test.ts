import { describe, expect, it } from "vitest";
import { getDcaProviders as getMobileDcaProviders } from "../examples/mobile/dca";
import { getDcaProviders as getWebDcaProviders } from "../examples/web/dca";

describe("example DCA provider registration", () => {
  it("keeps mobile and web examples aligned on DCA backends", () => {
    expect(getMobileDcaProviders().map((provider) => provider.id)).toEqual([
      "avnu",
      "ekubo",
    ]);
    expect(getWebDcaProviders().map((provider) => provider.id)).toEqual([
      "avnu",
      "ekubo",
    ]);
  });
});
