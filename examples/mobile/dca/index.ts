import { AvnuDcaProvider, EkuboDcaProvider, type DcaProvider } from "starkzap";

export function getDcaProviders(): DcaProvider[] {
  return [new AvnuDcaProvider(), new EkuboDcaProvider()];
}
