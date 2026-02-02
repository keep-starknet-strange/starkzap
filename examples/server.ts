import express from "express";
import cors from "cors";
import { PrivyClient } from "@privy-io/node";

// Load from environment variables
const PRIVY_APP_ID = process.env.PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.error(
    "Missing PRIVY_APP_ID or PRIVY_APP_SECRET environment variables"
  );
  console.error(
    "   Run with: PRIVY_APP_ID=xxx PRIVY_APP_SECRET=xxx npx tsx server.ts"
  );
  process.exit(1);
}

const privy = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET,
});

const app = express();
app.use(cors());
app.use(express.json());

// Store user -> wallet mappings in memory (for demo purposes)
const userWallets: Map<
  string,
  { id: string; address: string; publicKey: string; privyUserId: string }
> = new Map();

/**
 * Register/login a user by email and create a Starknet wallet if needed
 */
app.post("/api/user/register", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    // Check if we already have this user locally
    if (userWallets.has(email)) {
      const existing = userWallets.get(email)!;
      console.log(
        `Returning existing user wallet for ${email}: ${existing.address}`
      );
      return res.json({
        isNew: false,
        userId: existing.privyUserId,
        wallet: {
          id: existing.id,
          address: existing.address,
          publicKey: existing.publicKey,
        },
      });
    }

    console.log(`Registering new user: ${email}`);

    // Try to find existing Privy user by email
    let privyUser;
    try {
      privyUser = await privy.users().getByEmailAddress(email);
      console.log(`Found existing Privy user: ${privyUser.id}`);
    } catch {
      // User doesn't exist, create one
      console.log(`Creating new Privy user for: ${email}`);
      privyUser = await privy.users().create({
        linked_accounts: [
          {
            type: "email",
            address: email,
          },
        ],
      });
      console.log(`Created Privy user: ${privyUser.id}`);
    }

    // Create a Starknet wallet for this user
    console.log(`Creating Starknet wallet for user: ${privyUser.id}`);
    const wallet = await privy.wallets().create({
      chain_type: "starknet",
    });

    console.log(`Wallet from Privy:`);
    console.log(`  id: ${wallet.id}`);
    console.log(`  address: ${wallet.address}`);
    console.log(`  public_key: ${wallet.public_key}`);
    console.log(`  public_key length: ${wallet.public_key?.length}`);

    const walletData = {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.public_key as string,
      privyUserId: privyUser.id,
    };

    // Store for later use
    userWallets.set(email, walletData);

    console.log(`Created wallet: ${wallet.address}`);
    res.json({
      isNew: true,
      userId: privyUser.id,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey: wallet.public_key,
      },
    });
  } catch (error) {
    console.error("Failed to register user:", error);
    res.status(500).json({
      error: "Failed to register user",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Create a new Starknet wallet (standalone, no user)
 */
app.post("/api/wallet/create", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Check if wallet already exists for this user
    if (userWallets.has(userId)) {
      const existing = userWallets.get(userId)!;
      console.log(
        `Returning existing wallet for ${userId}: ${existing.address}`
      );
      return res.json({
        id: existing.id,
        address: existing.address,
        publicKey: existing.publicKey,
      });
    }

    console.log(`Creating Starknet wallet for user: ${userId}`);

    // Create a Starknet wallet via Privy
    const wallet = await privy.wallets().create({
      chain_type: "starknet",
    });

    const walletData = {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.public_key as string,
      privyUserId: userId,
    };

    // Store for later use
    userWallets.set(userId, walletData);

    console.log(`Created wallet: ${wallet.address}`);
    res.json({
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.public_key,
    });
  } catch (error) {
    console.error("Failed to create wallet:", error);
    res.status(500).json({
      error: "Failed to create wallet",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Sign a message hash using Privy's rawSign
 */
app.post("/api/wallet/sign", async (req, res) => {
  try {
    const { walletId, hash } = req.body;

    if (!walletId || !hash) {
      return res.status(400).json({ error: "walletId and hash are required" });
    }

    console.log(`Signing hash for wallet ${walletId}: ${hash}`);

    // Call Privy's rawSign endpoint
    const result = await privy.wallets().rawSign(walletId, {
      params: { hash },
    });

    console.log(`Raw Privy response:`, JSON.stringify(result, null, 2));

    // The signature from Privy - log full details for debugging
    const signature = result.signature;
    console.log(`Signature type: ${typeof signature}`);
    console.log(`Signature value: ${signature}`);
    console.log(
      `Signature length (if string): ${typeof signature === "string" ? signature.length : "N/A"}`
    );

    res.json({ signature });
  } catch (error) {
    console.error("Failed to sign:", error);
    res.status(500).json({
      error: "Failed to sign",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get wallet info by email
 */
app.get("/api/user/:email", (req, res) => {
  const { email } = req.params;
  const wallet = userWallets.get(email);

  if (!wallet) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    userId: wallet.privyUserId,
    wallet: {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.publicKey,
    },
  });
});

/**
 * Health check
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", privyAppId: PRIVY_APP_ID.slice(0, 8) + "..." });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`
Privy Server running on http://localhost:${PORT}

Endpoints:
  POST /api/user/register  - Register/login user by email & create wallet
  POST /api/wallet/create  - Create a standalone Starknet wallet
  POST /api/wallet/sign    - Sign a hash with rawSign
  GET  /api/user/:email    - Get user wallet info
  GET  /api/health         - Health check

Privy App ID: ${PRIVY_APP_ID.slice(0, 8)}...
  `);
});
