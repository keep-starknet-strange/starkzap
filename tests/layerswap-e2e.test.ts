/**
 * LayerSwap Bridge End-to-End Test (Real Wallet)
 *
 * Performs a real ETH deposit from Ethereum Sepolia → Starknet Sepolia
 * via LayerSwap using a private key signer.
 *
 * Required environment variables:
 *   LAYERSWAP_API_KEY    — LayerSwap API key
 *   ETH_PRIVATE_KEY      — Ethereum Sepolia private key (with Sepolia ETH)
 *   ETH_RPC_URL          — Ethereum Sepolia RPC URL (e.g. https://rpc.sepolia.org)
 *   STARKNET_ADDRESS     — Starknet recipient address on Sepolia
 *
 * Run with:
 *   LAYERSWAP_API_KEY="..." ETH_PRIVATE_KEY="..." ETH_RPC_URL="..." STARKNET_ADDRESS="..." \
 *     npx vitest run tests/layerswap-e2e.test.ts
 */
import { describe, expect, it } from "vitest";
import { LayerSwapBridge } from "@/bridge/ethereum/layerswap/LayerSwapBridge";
import {
  EthereumBridgeToken,
  Protocol,
  ChainId,
  Amount,
  fromAddress,
} from "@/types";
import type { EthereumAddress } from "@/types";
import type { WalletInterface } from "@/wallet";
import type { EthereumWalletConfig } from "@/bridge/ethereum/types";
import { NOOP_LOGGER } from "@/logger";

const API_KEY = process.env["LAYERSWAP_API_KEY"] ?? "";
const ETH_PRIVATE_KEY = process.env["ETH_PRIVATE_KEY"] ?? "";
const ETH_RPC_URL = process.env["ETH_RPC_URL"] ?? "https://rpc.sepolia.org";
const STARKNET_ADDRESS = process.env["STARKNET_ADDRESS"] ?? "";

const canRun =
  API_KEY.length > 0 &&
  ETH_PRIVATE_KEY.length > 0 &&
  STARKNET_ADDRESS.length > 0;

// Amount to bridge (small — 0.0001 ETH ≈ $0.20)
const DEPOSIT_AMOUNT = "0.0001";

function layerSwapEthToken(): EthereumBridgeToken {
  return new EthereumBridgeToken({
    id: "eth-layerswap",
    name: "Ethereum (LayerSwap)",
    symbol: "ETH",
    decimals: 18,
    protocol: Protocol.LAYERSWAP,
    address: "0x0000000000000000000000000000000000000000" as EthereumAddress,
    l1Bridge: "0x0000000000000000000000000000000000000000" as EthereumAddress,
    starknetAddress: fromAddress(
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
    ),
    starknetBridge: fromAddress("0x0"),
    supportsAutoWithdraw: false,
  });
}

function mockStarknetWallet(): WalletInterface {
  return {
    address: fromAddress(STARKNET_ADDRESS),
    getChainId: () => ChainId.SEPOLIA,
  } as unknown as WalletInterface;
}

async function createEthWalletConfig(): Promise<EthereumWalletConfig> {
  const { JsonRpcProvider, Wallet } = await import("ethers");
  const provider = new JsonRpcProvider(ETH_RPC_URL, 11155111);
  const signer = new Wallet(ETH_PRIVATE_KEY, provider);

  const address = await signer.getAddress();
  const balance = await provider.getBalance(address);
  console.log(`Ethereum wallet: ${address}`);
  console.log(`Balance: ${Number(balance) / 1e18} ETH`);

  return { provider, signer } as unknown as EthereumWalletConfig;
}

describe("LayerSwap E2E (real wallet)", () => {
  it.skipIf(!canRun)(
    "should deposit ETH from Ethereum Sepolia to Starknet Sepolia",
    async () => {
      const token = layerSwapEthToken();
      const ethConfig = await createEthWalletConfig();
      const starknetWallet = mockStarknetWallet();

      const bridge = new LayerSwapBridge(
        token,
        ethConfig,
        starknetWallet,
        API_KEY,
        NOOP_LOGGER
      );

      // 1. Check balance
      const signerAddress = await ethConfig.signer.getAddress();
      const balance = await bridge.getAvailableDepositBalance(
        signerAddress as EthereumAddress
      );
      console.log(`Available balance: ${balance.toFormatted()}`);

      const depositAmount = Amount.parse(DEPOSIT_AMOUNT, 18, "ETH");
      expect(balance.toBase() > depositAmount.toBase()).toBe(true);

      // 2. Get fee estimate
      const fees = await bridge.getDepositFeeEstimate();
      console.log("Fee estimate:", {
        l1Fee: fees.l1Fee.toFormatted(),
        serviceFee: fees.serviceFee.toFormatted(),
        avgCompletionTime: fees.avgCompletionTime,
      });

      // 3. Execute deposit
      console.log(
        `Depositing ${depositAmount.toFormatted()} to ${STARKNET_ADDRESS}...`
      );
      const result = await bridge.deposit(
        fromAddress(STARKNET_ADDRESS),
        depositAmount
      );

      console.log(`Deposit transaction hash: ${result.hash}`);
      console.log(
        `Track on Etherscan: https://sepolia.etherscan.io/tx/${result.hash}`
      );

      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBeGreaterThan(0);
    },
    120_000 // 2 minute timeout for on-chain tx
  );
});
