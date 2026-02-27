import { installPolyfills } from "@/polyfills";

export const starkzapNativeReady = installPolyfills();
starkzapNativeReady.catch((error) => {
  setTimeout(() => {
    throw error;
  }, 0);
});

export * from "@/index";
