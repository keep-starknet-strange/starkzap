import type { CartridgeNativeAdapter } from "@/cartridge/types";

let cartridgeNativeAdapter: CartridgeNativeAdapter | null = null;

const MISSING_NATIVE_ADAPTER_MESSAGE =
  "Cartridge adapter is not registered. Call registerCartridgeNativeAdapter(adapter) or registerCartridgeTsAdapter(options) once at app startup before connectCartridge()/onboard({ strategy: OnboardStrategy.Cartridge }).";

export function registerCartridgeNativeAdapter(
  adapter: CartridgeNativeAdapter
): void {
  cartridgeNativeAdapter = adapter;
}

export function clearCartridgeNativeAdapter(): void {
  cartridgeNativeAdapter = null;
}

export function getCartridgeNativeAdapter(): CartridgeNativeAdapter | null {
  return cartridgeNativeAdapter;
}

export function getCartridgeNativeAdapterOrThrow(): CartridgeNativeAdapter {
  if (!cartridgeNativeAdapter) {
    throw new Error(MISSING_NATIVE_ADAPTER_MESSAGE);
  }
  return cartridgeNativeAdapter;
}
