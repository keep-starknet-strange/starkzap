/**
 * One-time setup for signing Privy wallet requests.
 *
 *   npm run setup:signer
 *
 * Generates the P-256 key pair this server authorizes Privy wallet requests
 * with, and prints it for pasting into .env.
 *
 * Why it is needed: a Privy wallet action must be authorized by the wallet's
 * owner. The app secret only *authenticates* the request. Creating a wallet with
 * `owner: { user_id }` makes Privy build an owner key quorum containing that
 * user and no keys at all:
 *
 *     { authorization_threshold: 1, authorization_keys: [], user_ids: [user] }
 *
 * Nothing can then authorize a signature except a user signing key, which a
 * wallet created through the API does not have — so every request fails with
 * 401 "No valid authorization keys or user signing keys available".
 *
 * So the server creates the quorum itself, with the user *and* this key as
 * members at threshold 1 (see /api/privy-wallet/starknet). The user is a real
 * owner, and either party can authorize on its own.
 *
 * Keep the private key secret. It authorizes every wallet whose quorum lists its
 * public half; losing it makes those wallets unusable, because changing an owner
 * needs the current owner's authorization.
 */
import "dotenv/config";
import { generateP256KeyPair } from "@privy-io/node";

// Wrapped rather than top-level await: this package is CommonJS (no "type":
// "module"), where top-level await is a syntax error.
async function main() {
  const { publicKey, privateKey } = await generateP256KeyPair();

  console.log(`
Add these to examples/server/.env — treat the private key like PRIVY_APP_SECRET:

PRIVY_SIGNER_PUBLIC_KEY=${publicKey}
PRIVY_SIGNER_PRIVATE_KEY=${privateKey}

Wallets created from now on list this key in their owner quorum alongside the
user, so this server can sign for them. Wallets created earlier cannot be
migrated — a wallet's owner cannot be changed without the current owner's
authorization — so delete wallets.json to have fresh ones created. Their
Starknet addresses change.
`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
