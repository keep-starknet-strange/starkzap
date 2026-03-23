import { describe, expectTypeOf, it } from "vitest";
import type { OnboardResult } from "starkzap";
import type { StarkZap } from "@/sdk";
import type { OnboardOptions } from "@/types/onboard";

type NativeCartridgeOnboard = Extract<
  OnboardOptions,
  { strategy: "cartridge" }
>;
type NativeSignerOnboard = Extract<OnboardOptions, { strategy: "signer" }>;

type OnboardParam = Parameters<StarkZap["onboard"]>[0];

/**
 * Typing regression for union-shaped `onboard` arguments (no overload resolution failures).
 * Uses a `Pick<StarkZap, "onboard">` stub so we exercise real `sdk.onboard(options)` call
 * expressions without constructing `StarkZap` or running onboarding.
 */
describe("native StarkZap.onboard typing", () => {
  const sdk: Pick<StarkZap, "onboard"> = {
    onboard: async (_options: OnboardParam): Promise<OnboardResult> =>
      ({}) as OnboardResult,
  };

  it("accepts a variable typed as the full native OnboardOptions union", () => {
    const options = null as unknown as OnboardOptions;
    expectTypeOf(options).toExtend<OnboardParam>();
    expectTypeOf(sdk.onboard(options)).toExtend<Promise<OnboardResult>>();
  });

  it("accepts a mixed union of cartridge and signer native variants", () => {
    const options = null as unknown as
      | NativeCartridgeOnboard
      | NativeSignerOnboard;
    expectTypeOf(sdk.onboard(options)).toExtend<Promise<OnboardResult>>();
  });

  it("accepts native cartridge variant args", () => {
    const options: NativeCartridgeOnboard = {
      strategy: "cartridge",
      cartridge: {
        policies: [{ target: "0x1", method: "transfer" }],
      },
    };
    expectTypeOf(sdk.onboard(options)).toExtend<Promise<OnboardResult>>();
  });
});
