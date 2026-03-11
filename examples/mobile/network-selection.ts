export interface NetworkOption<TChain> {
  chainId: TChain;
  rpcUrl: string;
}

export interface NetworkSelectionPatch<TChain> {
  selectedNetworkIndex: number;
  rpcUrl?: string;
  chainId?: TChain;
}

export function getNetworkSelectionPatch<TChain>(params: {
  index: number;
  isConfigured: boolean;
  network?: NetworkOption<TChain>;
}): NetworkSelectionPatch<TChain> | null {
  if (!params.network) {
    return null;
  }

  if (params.isConfigured) {
    return {
      selectedNetworkIndex: params.index,
    };
  }

  return {
    selectedNetworkIndex: params.index,
    rpcUrl: params.network.rpcUrl,
    chainId: params.network.chainId,
  };
}
