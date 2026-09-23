import "dotenv/config";
import {
  Amount,
  ChainId,
  fromAddress,
  Paycrest,
  PaycrestOrderError,
  StarkSigner,
  StarkZap,
  mainnetTokens,
  type FeeMode,
  type Token,
} from "starkzap";

/**
 * Off-ramp via the Sender API path: Paycrest creates the order,
 * returns a `receiveAddress`, and the SDK transfers the tokens to it.
 *
 * Sponsorship:
 * - Set `AVNU_PAYMASTER_API_KEY` to sponsor the client-side `transfer`
 *   call via AVNU's paymaster (gasless for the user).
 * - Within sponsored mode, set `PAYCREST_GAS_TOKEN=USDT|USDC|STRK|ETH`
 *   to pay gas in that token instead of being fully sponsored.
 * - Unset both for the SDK's default `user_pays` mode (user spends
 *   STRK from the wallet to cover gas).
 *
 * Token defaults to USDT; set `PAYCREST_TOKEN=USDC` to opt into USDC.
 */
async function main() {
  const apiKey = required("PAYCREST_API_KEY");
  const rpcUrl = required("RPC_URL");
  const privateKey = required("PRIVATE_KEY");
  const walletAddress = fromAddress(required("WALLET_ADDRESS"));

  const sdk = new StarkZap({
    rpcUrl,
    chainId: ChainId.MAINNET,
    paycrest: { apiKey },
    ...avnuPaymasterFromEnv(),
  });

  const wallet = await sdk.connectWallet({
    accountAddress: walletAddress,
    account: { signer: new StarkSigner(privateKey) },
  });
  await wallet.ensureReady({ deploy: "if_needed" });

  const token = resolveToken();
  const feeMode = resolveFeeMode();
  const paycrest = new Paycrest({ apiKey });
  const result = await paycrest.offramp(
    wallet,
    {
      path: "api",
      from: {
        token,
        amount: Amount.parse("0.5", token),
      },
      to: {
        currency: "NGN",
        recipient: {
          institution: required("RECIPIENT_INSTITUTION"),
          accountIdentifier: required("RECIPIENT_ACCOUNT_IDENTIFIER"),
          accountName: required("RECIPIENT_ACCOUNT_NAME"),
        },
      },
      reference: `demo-${Date.now()}`,
    },
    feeMode ? { feeMode } : undefined
  );

  console.log("orderId:", await result.orderId);
  console.log("receiveAddress:", result.receiveAddress);
  console.log("validUntil:", result.providerAccount?.validUntil);
  console.log("submitted transfer tx:", result.tx.hash);

  // result.wait() polls /v2/sender/orders/{uuid} until terminal.
  try {
    const status = await result.wait();
    console.log("final status:", status.status);
  } catch (err) {
    if (err instanceof PaycrestOrderError) {
      // Log only status + order id — `err.order` includes the
      // recipient bank details and would leak PII.
      console.error("order ended in:", err.order.status, err.order.id);
      process.exit(2);
    }
    throw err;
  }
}

// Trim env values and treat empty / whitespace-only strings as missing,
// so callers can't accidentally pass a blank token or api key past the
// validation gate and into a confusing runtime failure downstream.
function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function required(name: string): string {
  const v = envValue(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function resolveToken(): Token {
  const raw = envValue("PAYCREST_TOKEN");
  const symbol = (raw ?? "USDT").toUpperCase();
  if (symbol === "USDT") return mainnetTokens.USDT;
  if (symbol === "USDC") return mainnetTokens.USDC;
  throw new Error(`PAYCREST_TOKEN must be USDC or USDT (got: ${raw})`);
}

function resolveOptionalGasToken(): Token | undefined {
  const symbol = envValue("PAYCREST_GAS_TOKEN");
  if (!symbol) return undefined;
  const upper = symbol.toUpperCase();
  if (upper === "USDT") return mainnetTokens.USDT;
  if (upper === "USDC") return mainnetTokens.USDC;
  if (upper === "STRK") return mainnetTokens.STRK;
  if (upper === "ETH") return mainnetTokens.ETH;
  throw new Error(
    `PAYCREST_GAS_TOKEN must be one of USDT, USDC, STRK, ETH (got: ${symbol})`
  );
}

// AVNU's public paymaster requires `x-paymaster-api-key` for sponsored
// mode. When the env var is set, inject it via the `paymaster` config;
// otherwise fall back to starknet.js's default paymaster (which is fine
// for user-pays-STRK flows that don't hit the paymaster at all).
// `nodeUrl` is set explicitly because starknet.js's `PaymasterRpc`
// falls back to the Sepolia paymaster when no `nodeUrl` is provided —
// this example targets mainnet.
function avnuPaymasterFromEnv() {
  const key = envValue("AVNU_PAYMASTER_API_KEY");
  if (!key) return {};
  return {
    paymaster: {
      nodeUrl: "SN_MAIN",
      headers: { "x-paymaster-api-key": key },
    },
  } as const;
}

function resolveFeeMode(): FeeMode | undefined {
  const key = envValue("AVNU_PAYMASTER_API_KEY");
  const gasToken = resolveOptionalGasToken();
  if (!key) {
    if (gasToken) {
      throw new Error(
        "PAYCREST_GAS_TOKEN requires AVNU_PAYMASTER_API_KEY (paymaster mode). Unset one or set the other."
      );
    }
    return undefined;
  }
  return gasToken
    ? { type: "paymaster", gasToken: gasToken.address }
    : { type: "paymaster" };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
