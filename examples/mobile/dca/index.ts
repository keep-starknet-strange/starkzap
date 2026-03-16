// NOTE: This file is identical to examples/web/dca/index.ts — keep in sync.
import { AvnuDcaProvider, EkuboDcaProvider, type DcaProvider } from "starkzap";

export function getDcaProviders(): DcaProvider[] {
  return [new AvnuDcaProvider(), new EkuboDcaProvider()];
}
