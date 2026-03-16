import { describe, expect, it } from "vitest";
import { hydrateDcaCancelInput } from "@/dca/utils";
import { fromAddress } from "@/types";

describe("dca utils", () => {
  describe("hydrateDcaCancelInput", () => {
    it("returns an order-id request when only orderId is provided", () => {
      expect(
        hydrateDcaCancelInput({
          orderId: "ekubo-v1:0x1:7:0x111:0x222:300:1710000000:1710086400",
        })
      ).toEqual({
        orderId: "ekubo-v1:0x1:7:0x111:0x222:300:1710000000:1710086400",
      });
    });

    it("normalizes orderAddress when canceling by address", () => {
      expect(
        hydrateDcaCancelInput({
          orderAddress: "0x123",
        })
      ).toEqual({
        orderAddress: fromAddress("0x123"),
      });
    });

    it("keeps both fields when both are provided", () => {
      expect(
        hydrateDcaCancelInput({
          orderId: "ekubo-v1:0x1:7:0x111:0x222:300:1710000000:1710086400",
          orderAddress: "0x123",
        })
      ).toEqual({
        orderId: "ekubo-v1:0x1:7:0x111:0x222:300:1710000000:1710086400",
        orderAddress: fromAddress("0x123"),
      });
    });

    it("rejects empty cancel requests", () => {
      expect(() => hydrateDcaCancelInput({ orderId: "" })).toThrow(
        "DCA cancel requires either orderId or orderAddress"
      );
    });
  });
});
