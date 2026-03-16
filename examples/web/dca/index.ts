// NOTE: This file is identical to examples/mobile/dca/index.ts — keep in sync.
import { AvnuDcaProvider, EkuboDcaProvider, type DcaProvider } from "starkzap";

export function getDcaProviders(): DcaProvider[] {
  return [new AvnuDcaProvider(), new EkuboDcaProvider()];
}
