import { loadOptionalPeerDependency } from "@/peers/optional-peer";

let installPromise: Promise<void> | null = null;

export function installPolyfills(): Promise<void> {
  if (!installPromise) {
    installPromise = install();
  }
  return installPromise;
}

async function install(): Promise<void> {
  await loadOptionalPeerDependency({
    peerDependency: "fast-text-encoding",
    feature: "Native text encoding support",
    load: () => import("fast-text-encoding"),
  });

  await loadOptionalPeerDependency({
    peerDependency: "react-native-get-random-values",
    feature: "Native random values support",
    load: () => import("react-native-get-random-values"),
  });

  await loadOptionalPeerDependency({
    peerDependency: "@ethersproject/shims",
    feature: "Native ethers compatibility shims",
    load: () => import("@ethersproject/shims"),
  });
}
