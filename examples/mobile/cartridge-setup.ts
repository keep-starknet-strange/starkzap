/**
 * Cartridge native session: Expo WebBrowser + Linking adapter registration.
 * Mirrors examples/tic-tac-toe/app/context/StarknetConnector.tsx (minimal subset).
 */
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

type CartridgeTsOpenSessionArgs = {
  url: string;
  redirectUrl?: string;
  redirectQueryName: string;
};

type CartridgeTsOpenSessionResult = {
  encodedSession?: string;
  callbackUrl?: string;
  status?: "success" | "cancel" | "dismiss";
};

type StarkZapNativeModule = typeof import("starkzap-native") & {
  registerCartridgeTsAdapter: (options?: {
    logger?: Pick<Console, "info" | "warn" | "error">;
    sessionRegistrationTimeoutMs?: number;
    sessionRequestTimeoutMs?: number;
    openSession?: (
      args: CartridgeTsOpenSessionArgs
    ) => Promise<CartridgeTsOpenSessionResult>;
  }) => unknown;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Public redirect for Cartridge OAuth return; env override or Expo Linking default. */
export function resolveCartridgeRedirectUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL?.trim();
  if (configured) {
    return configured;
  }

  try {
    const generated = Linking.createURL("cartridge/callback");
    return generated.trim().length > 0 ? generated : undefined;
  } catch (error) {
    console.warn(
      "[cartridge-setup] Linking.createURL failed; redirect-based auth unavailable:",
      toErrorMessage(error)
    );
    return undefined;
  }
}

export type ResolvedCartridgeConfig = {
  preset: string;
  url?: string;
  redirectUrl?: string;
};

/**
 * Returns Cartridge onboarding config when EXPO_PUBLIC_CARTRIDGE_PRESET is set.
 * Otherwise `null` (UI should explain missing env, not fail silently).
 */
export function resolveCartridgeConfig(): ResolvedCartridgeConfig | null {
  const preset = process.env.EXPO_PUBLIC_CARTRIDGE_PRESET?.trim();
  if (!preset) {
    return null;
  }

  const urlRaw = process.env.EXPO_PUBLIC_CARTRIDGE_URL?.trim();
  const redirectUrl = resolveCartridgeRedirectUrl();

  return {
    preset,
    ...(urlRaw ? { url: urlRaw } : {}),
    ...(redirectUrl ? { redirectUrl } : {}),
  };
}

function registerTsCartridgeAdapter(
  native: StarkZapNativeModule,
  defaultRedirectUrl?: string
): void {
  if (typeof native.registerCartridgeTsAdapter !== "function") {
    throw new Error(
      "Installed starkzap-native build does not expose registerCartridgeTsAdapter(). Rebuild starkzap-native before running the app."
    );
  }

  native.registerCartridgeTsAdapter({
    logger: console,
    sessionRegistrationTimeoutMs: 180_000,
    sessionRequestTimeoutMs: 10_000,
    openSession: async ({
      url,
      redirectUrl,
    }: CartridgeTsOpenSessionArgs): Promise<CartridgeTsOpenSessionResult> => {
      const callbackUrl = redirectUrl ?? defaultRedirectUrl;
      if (callbackUrl) {
        const authResult = await WebBrowser.openAuthSessionAsync(
          url,
          callbackUrl
        );

        if (authResult.type === "success") {
          const resolvedUrl =
            "url" in authResult && authResult.url ? authResult.url : undefined;
          return { status: "success", callbackUrl: resolvedUrl };
        }

        return { status: authResult.type === "cancel" ? "cancel" : "dismiss" };
      }

      await WebBrowser.openBrowserAsync(url);
      return {};
    },
  });
}

let nativeModulePromise: Promise<StarkZapNativeModule> | null = null;
function loadNativeModule(): Promise<StarkZapNativeModule> {
  if (!nativeModulePromise) {
    nativeModulePromise =
      import("starkzap-native") as unknown as Promise<StarkZapNativeModule>;
  }
  return nativeModulePromise;
}

let didRegisterCartridgeAdapter = false;
let adapterRegistrationPromise: Promise<void> | null = null;

export async function ensureCartridgeAdapterRegistered(
  defaultRedirectUrl?: string
): Promise<void> {
  if (didRegisterCartridgeAdapter) {
    return;
  }
  if (adapterRegistrationPromise) {
    return adapterRegistrationPromise;
  }

  adapterRegistrationPromise = (async () => {
    const native = await loadNativeModule();
    registerTsCartridgeAdapter(native, defaultRedirectUrl);
    didRegisterCartridgeAdapter = true;
  })();

  try {
    await adapterRegistrationPromise;
  } finally {
    adapterRegistrationPromise = null;
  }
}
