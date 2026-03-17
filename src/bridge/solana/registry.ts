import type { ChainId, ChainIdLiteral, SolanaBridgeToken } from "@/types";
import type { SolanaWalletConfig } from "@/bridge";
import type { WalletInterface } from "@/wallet";
import type { HyperlaneRuntime } from "@/bridge/solana/hyperlaneRuntime";
import type {
  ChainMap,
  ChainMetadata,
  MultiProtocolProvider,
  ProviderType as HyperlaneProviderType,
  Token as HyperlaneToken,
  TokenStandard as HyperlaneTokenStandard,
} from "@hyperlane-xyz/sdk";

type ChainMetadataWithMailbox = ChainMetadata & { mailbox?: string };

function buildTestnetChainMap(
  hyperlane: HyperlaneRuntime
): ChainMap<ChainMetadataWithMailbox> {
  return {
    solanatestnet: {
      ...hyperlane.registry.solanatestnet,
      mailbox: hyperlane.registry.solanatestnetAddresses.mailbox,
    },
    starknetsepolia: {
      ...hyperlane.registry.starknetsepolia,
      mailbox: hyperlane.registry.starknetsepoliaAddresses.mailbox,
    },
  };
}

function buildMainnetChainMap(
  hyperlane: HyperlaneRuntime
): ChainMap<ChainMetadataWithMailbox> {
  return {
    solanamainnet: {
      ...hyperlane.registry.solanamainnet,
      mailbox: hyperlane.registry.solanamainnetAddresses.mailbox,
    },
    starknet: {
      ...hyperlane.registry.starknet,
      mailbox: hyperlane.registry.starknetAddresses.mailbox,
    },
  };
}

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
  starknetWallet: WalletInterface,
  hyperlane: HyperlaneRuntime
): MultiProtocolProvider {
  const chainId = starknetWallet.getChainId();
  const chains = chainId.isMainnet()
    ? buildMainnetChainMap(hyperlane)
    : buildTestnetChainMap(hyperlane);

  const MultiProtocolProviderCtor = hyperlane.sdk.MultiProtocolProvider;
  const ProviderType = hyperlane.sdk.ProviderType;

  const multiProvider = new MultiProtocolProviderCtor<{
    mailbox?: string;
  }>(chains) as MultiProtocolProvider;

  type SolanaTypedProvider = Extract<
    Parameters<MultiProtocolProvider["setProvider"]>[1],
    { type: HyperlaneProviderType.SolanaWeb3 }
  >;

  const solanaProvider: SolanaTypedProvider = {
    type: ProviderType.SolanaWeb3 as SolanaTypedProvider["type"],
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
  hyperlaneChain: HyperlaneChain,
  hyperlane: HyperlaneRuntime
): HyperlaneToken {
  const isStarknet = hyperlaneChain === "starknet";
  const bridgeAddress = isStarknet ? token.starknetBridge : token.bridgeAddress;
  const collateralAddress = isStarknet ? token.starknetAddress : token.address;
  const isNative = token.id === "sol";

  const TokenStandard = hyperlane.sdk.TokenStandard;
  const tokenStandard =
    hyperlaneChain === "starknet"
      ? (TokenStandard.StarknetHypSynthetic as HyperlaneTokenStandard)
      : isNative
        ? (TokenStandard.SealevelHypNative as HyperlaneTokenStandard)
        : (TokenStandard.SealevelHypCollateral as HyperlaneTokenStandard);

  const HyperlaneTokenCtor = hyperlane.sdk.Token;

  return new HyperlaneTokenCtor({
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    chainName: hyperlaneChainName(chainId, hyperlaneChain),
    addressOrDenom: bridgeAddress,
    collateralAddressOrDenom: collateralAddress,
    standard: tokenStandard,
  }) as HyperlaneToken;
}
