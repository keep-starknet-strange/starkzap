import { AvnuDcaProvider, EkuboDcaProvider, type DcaProvider } from "starkzap";

export const dcaProviders: DcaProvider[] = [
  new AvnuDcaProvider(),
  new EkuboDcaProvider(),
];
