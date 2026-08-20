import "dotenv/config";
import { fromAddress, Paycrest, mainnetTokens, type Token } from "starkzap";

/**
 * On-ramp 1000 NGN -> stablecoin delivered to a Starknet wallet.
 * Token defaults to USDT; set `PAYCREST_TOKEN=USDC` to opt into USDC.
 *
 * On-ramp is Sender-API-only — Paycrest does not support on-ramp via
 * the Cairo Gateway. The response carries the bank account the user
 * must transfer fiat into; tokens are delivered after the transfer is
 * verified.
 */
async function main() {
  const apiKey = required("PAYCREST_API_KEY");
  const walletAddress = fromAddress(required("WALLET_ADDRESS"));

  // No wallet connection needed for on-ramp — Paycrest's on-ramp is
  // Sender-API-only and is wallet-independent.
  const paycrest = new Paycrest({ apiKey });
  const result = await paycrest.onramp({
    from: {
      currency: "NGN",
      amount: 1_000,
      refundAccount: {
        institution: required("RECIPIENT_INSTITUTION"),
        accountIdentifier: required("RECIPIENT_ACCOUNT_IDENTIFIER"),
        accountName: required("RECIPIENT_ACCOUNT_NAME"),
      },
    },
    to: { token: resolveToken(), recipient: walletAddress },
    reference: `onramp-${Date.now()}`,
  });

  console.log("Pay this account to fund your wallet:");
  console.log(`  bank:     ${result.providerAccount.institution}`);
  console.log(`  account:  ${result.providerAccount.accountIdentifier}`);
  console.log(`  name:     ${result.providerAccount.accountName}`);
  console.log(
    `  amount:   ${result.providerAccount.amountToTransfer} ${result.providerAccount.currency}`
  );
  console.log(`  expires:  ${result.validUntil}`);
  console.log(`Order id:   ${result.orderId}`);
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function resolveToken(): Token {
  const raw = process.env["PAYCREST_TOKEN"]?.trim();
  const symbol = (raw && raw.length > 0 ? raw : "USDT").toUpperCase();
  if (symbol === "USDT") return mainnetTokens.USDT;
  if (symbol === "USDC") return mainnetTokens.USDC;
  throw new Error(`PAYCREST_TOKEN must be USDC or USDT (got: ${raw})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
