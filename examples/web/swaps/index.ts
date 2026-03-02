import {
  AvnuSwapProvider,
  EkuboSwapProvider,
  type SwapProvider,
} from "starkzap";

export function getSwapProviders(): SwapProvider[] {
  return [new AvnuSwapProvider(), new EkuboSwapProvider()];
}
