import {
  solanamainnet,
  solanamainnetAddresses,
  solanatestnet,
  solanatestnetAddresses,
  starknet,
  starknetAddresses,
  starknetsepolia,
  starknetsepoliaAddresses,
} from "@hyperlane-xyz/registry";
import {
  type ChainMap,
  type ChainMetadata,
  MultiProtocolProvider,
  ProviderType,
  Token as HyperlaneToken,
  TokenStandard,
} from "@hyperlane-xyz/sdk";
import type { Address as HyperlaneAddress } from "@hyperlane-xyz/utils";
import type { ChainId } from "@/types";
import type { SolanaWalletConfig } from "@/bridge";
import type { WalletInterface } from "@/wallet";
import type { ChainIdLiteral, SolanaBridgeToken } from "@/types";

const testnetChainMap: ChainMap<
  ChainMetadata & { mailbox?: HyperlaneAddress }
> = {
  solanatestnet: {
    ...solanatestnet,
    mailbox: solanatestnetAddresses.mailbox,
  },
  starknetsepolia: {
    ...starknetsepolia,
    mailbox: starknetsepoliaAddresses.mailbox,
  },
};

const mainnetChainMap: ChainMap<
  ChainMetadata & { mailbox?: HyperlaneAddress }
> = {
  solanamainnet: {
    ...solanamainnet,
    mailbox: solanamainnetAddresses.mailbox,
  },
  starknet: { ...starknet, mailbox: starknetAddresses.mailbox },
};

type HyperlaneChain = "solana" | "starknet";

const STARKNET_CHAIN_TO_HYPERLANE: Record<
  ChainIdLiteral,
  Partial<Record<HyperlaneChain, string>>
> = {
  SN_MAIN: { starknet: "starknet", solana: "solanamainnet" },
  SN_SEPOLIA: { starknet: "starknetsepolia", solana: "solanatestnet" },
};

export function hyperlaneChainName(
  chainId: ChainId,
  hyperlaneChain: HyperlaneChain
): string {
  const hyperlaneConfig = STARKNET_CHAIN_TO_HYPERLANE[chainId.toLiteral()];
  if (!hyperlaneConfig) {
    throw new Error(`Unknown starknet chain ID: ${chainId.toLiteral()}`);
  }

  const name = hyperlaneConfig[hyperlaneChain];
  if (!name) {
    throw new Error(
      `Unknown chain "${hyperlaneChain}" for network ${chainId.toLiteral()}`
    );
  }

  return name;
}

export function setupMultiProtocolProvider(
  config: SolanaWalletConfig,
  starknetWallet: WalletInterface
): MultiProtocolProvider {
  const chainId = starknetWallet.getChainId();
  let chains;
  if (chainId.isMainnet()) {
    chains = mainnetChainMap;
  } else {
    chains = testnetChainMap;
  }

  const multiProvider = new MultiProtocolProvider<{
    mailbox?: HyperlaneAddress;
  }>(chains);

  type SolanaTypedProvider = Extract<
    Parameters<MultiProtocolProvider["setProvider"]>[1],
    { type: ProviderType.SolanaWeb3 }
  >;

  const solanaProvider: SolanaTypedProvider = {
    type: ProviderType.SolanaWeb3,
    // `connection` is intentionally opaque in public types to avoid exporting
    // @solana/web3.js symbols in SDK declarations.
    provider: config.connection as SolanaTypedProvider["provider"],
  };

  multiProvider.setProvider(
    hyperlaneChainName(chainId, "solana"),
    solanaProvider
  );

  return multiProvider;
}

export function bridgeTokenToHyperlaneToken(
  token: SolanaBridgeToken,
  chainId: ChainId,
  hyperlaneChain: HyperlaneChain
): HyperlaneToken {
  const isStarknet = hyperlaneChain === "starknet";
  const bridgeAddress = isStarknet ? token.starknetBridge : token.bridgeAddress;
  const collateralAddress = isStarknet ? token.starknetAddress : token.address;
  const isNative = token.id === "sol";

  let tokenStandard: TokenStandard;
  if (hyperlaneChain === "starknet") {
    tokenStandard = TokenStandard.StarknetHypSynthetic;
  } else if (isNative) {
    tokenStandard = TokenStandard.SealevelHypNative;
  } else {
    tokenStandard = TokenStandard.SealevelHypCollateral;
  }

  return new HyperlaneToken({
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    chainName: hyperlaneChainName(chainId, hyperlaneChain),
    addressOrDenom: bridgeAddress,
    collateralAddressOrDenom: collateralAddress,
    standard: tokenStandard,
  });
}
