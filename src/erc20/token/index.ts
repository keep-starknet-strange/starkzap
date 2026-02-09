import { CairoFelt252, Contract, RpcProvider } from "starknet";
import { type Address, type ChainId, getChainId, type Token } from "@/types";
import { groupBy } from "@/utils";
import { mainnetTokens } from "@/erc20/token/presets";
import { sepoliaTokens } from "@/erc20/token/presets.sepolia";
import { ABI as ERC20_ABI } from "@/abi/erc20";

export * from "@/erc20/token/presets";
export * from "@/erc20/token/presets.sepolia";

export function getPresets(chainId: ChainId): Record<string, Token> {
  switch (chainId.toLiteral()) {
    case "SN_MAIN":
      return mainnetTokens;
    case "SN_SEPOLIA":
      return sepoliaTokens;
    default:
      return {};
  }
}

export async function getTokensFromAddresses(
  tokenAddresses: Address[],
  provider: RpcProvider
): Promise<Token[]> {
  const chainId = await getChainId(provider);
  const presetTokens = Object.values(getPresets(chainId));

  const tokens: Token[] = [];
  const unknownTokenAddresses: Address[] = [];

  for (const tokenAddress of tokenAddresses) {
    const token = presetTokens.find((preset) => {
      return preset.address === tokenAddress;
    });

    if (token) {
      tokens.push(token);
    } else {
      unknownTokenAddresses.push(tokenAddress);
    }
  }

  if (unknownTokenAddresses.length > 0) {
    const erc20Contracts = unknownTokenAddresses.map((address) => {
      return new Contract({
        abi: ERC20_ABI,
        address: address,
        providerOrAccount: provider,
      }).typedv2(ERC20_ABI);
    });

    const results = await Promise.all(
      erc20Contracts
        .map((contract) => {
          return [
            contract.name().then((name) => {
              return {
                token: contract.address as Address,
                type: "name",
                value: new CairoFelt252(name).decodeUtf8(),
              };
            }),
            contract.symbol().then((symbol) => {
              return {
                token: contract.address as Address,
                type: "symbol",
                value: new CairoFelt252(symbol).decodeUtf8(),
              };
            }),
            contract.decimals().then((decimals) => {
              return {
                token: contract.address as Address,
                type: "decimals",
                value: Number(decimals),
              };
            }),
          ];
        })
        .flat()
    );

    const tokenDetails = groupBy(results, (r) => r.token);

    for (const unknownTokenAddress of unknownTokenAddresses) {
      const details = tokenDetails.get(unknownTokenAddress);
      if (details) {
        let name: string | null = null;
        let symbol: string | null = null;
        let decimals: number | null = null;
        for (const detail of details) {
          if (detail.type === "name" && typeof detail.value === "string") {
            name = detail.value as string;
          } else if (
            detail.type === "symbol" &&
            typeof detail.value === "string"
          ) {
            symbol = detail.value as string;
          } else if (
            detail.type === "decimals" &&
            typeof detail.value === "number"
          ) {
            decimals = detail.value;
          }
        }

        if (name && symbol && decimals) {
          tokens.push({
            name: name,
            address: unknownTokenAddress,
            decimals: decimals,
            symbol: symbol,
          });
        } else {
          console.warn("Could not determine token", unknownTokenAddress);
        }
      } else {
        console.warn("Could not determine token", unknownTokenAddress);
      }
    }
  }

  return tokens;
}
