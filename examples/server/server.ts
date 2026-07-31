import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import { PrivyClient } from "@privy-io/node";

// Each feature is opt-in via an ENABLE_* flag. A flag that's off means its
// routes are never registered and its env vars are not required — so a plain
// `npm start` with no flags serves only /api/health.
const ENABLE_PRIVY = process.env.ENABLE_PRIVY === "true";
const ENABLE_PAYMASTER = process.env.ENABLE_PAYMASTER === "true";

const app = express();
app.use(cors());

// Privacy proofs are megabytes of base64, far past express.json()'s 100kb
// default — which rejects them with an HTML 413 before any route runs, so the
// caller sees "non-JSON response" rather than a size problem. Scoped to the
// paymaster path and mounted first: body-parser skips a body already parsed, so
// every other route keeps the safe default. An integrator's own proxy needs the
// same allowance.
const PROOF_BODY_LIMIT = "32mb";
app.use("/api/paymaster", express.json({ limit: PROOF_BODY_LIMIT }));

app.use(express.json());

// --- Privy embedded wallets (opt-in) ---
// Set ENABLE_PRIVY=true with PRIVY_APP_ID + PRIVY_APP_SECRET.
if (ENABLE_PRIVY) {
  const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
  const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    console.error(
      "ENABLE_PRIVY is set but PRIVY_APP_ID / PRIVY_APP_SECRET are missing."
    );
    process.exit(1);
  }

  const privy = new PrivyClient({
    appId: PRIVY_APP_ID,
    appSecret: PRIVY_APP_SECRET,
  });

  app.get("/api/health/privy", (_, res) => res.json({ status: "ok" }));

  // Simple file-based wallet storage (use a real database in production)
  // Structure: { [userId]: { privyWallet: {...}, accounts: { [preset]: { address, deployed } } } }
  const WALLETS_FILE = "./wallets.json";
  type UserData = {
    privyWallet: { id: string; address: string; publicKey: string };
    accounts: Record<string, { address: string; deployed: boolean }>;
  };
  const users = new Map<string, UserData>(
    fs.existsSync(WALLETS_FILE)
      ? Object.entries(JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8")))
      : []
  );
  const saveData = () =>
    fs.writeFileSync(
      WALLETS_FILE,
      JSON.stringify(Object.fromEntries(users), null, 2)
    );

  // Verify Privy access token
  const auth = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Missing token" });

    try {
      const claims = await privy.utils().auth().verifyAccessToken(token);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).userId = claims.user_id;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Get or create Starknet wallet (Privy key pair)
  app.post("/api/privy-wallet/starknet", auth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).userId;

    const existing = users.get(userId);
    if (existing) {
      return res.json({
        wallet: existing.privyWallet,
        accounts: existing.accounts,
        isNew: false,
      });
    }

    try {
      // owner_id expects a cuid2 key-quorum id; to own by a Privy user pass
      // `owner: { user_id }` with the user's DID (from the verified token).
      const wallet = await privy.wallets().create({
        chain_type: "starknet",
        owner: { user_id: userId },
      });
      const privyWallet = {
        id: wallet.id,
        address: wallet.address,
        publicKey: wallet.public_key as string,
      };
      users.set(userId, { privyWallet, accounts: {} });
      saveData();
      res.json({ wallet: privyWallet, accounts: {}, isNew: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Register a computed account address for a preset
  app.post("/api/privy-wallet/register-account", auth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).userId;
    const { preset, address, deployed } = req.body;

    if (!preset || !address) {
      return res.status(400).json({ error: "preset and address required" });
    }

    const user = users.get(userId);
    if (!user) {
      return res
        .status(404)
        .json({ error: "User not found, create wallet first" });
    }

    user.accounts[preset] = { address, deployed: deployed ?? false };
    saveData();
    res.json({ success: true, accounts: user.accounts });
  });

  // Update deployment status for an account
  app.post("/api/privy-wallet/set-deployed", auth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).userId;
    const { preset, deployed } = req.body;

    if (!preset) {
      return res.status(400).json({ error: "preset required" });
    }

    const user = users.get(userId);
    if (!user || !user.accounts[preset]) {
      return res.status(404).json({ error: "Account not found" });
    }

    user.accounts[preset].deployed = deployed ?? true;
    saveData();
    res.json({ success: true, accounts: user.accounts });
  });

  // Sign a hash with the caller's own wallet.
  //
  // Authenticated, and the wallet is looked up from the verified user rather
  // than taken from the request. A `walletId` in the body is only honoured if
  // it matches — otherwise any caller who learned another user's wallet id
  // could have this endpoint sign arbitrary hashes with it, which for a
  // Starknet account means signing arbitrary transactions.
  app.post("/api/privy-wallet/sign", auth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).userId;
    const { walletId, hash } = req.body;

    if (!hash) return res.status(400).json({ error: "hash required" });

    const user = users.get(userId);
    if (!user) {
      return res
        .status(404)
        .json({ error: "User not found, create wallet first" });
    }
    if (walletId && walletId !== user.privyWallet.id) {
      return res
        .status(403)
        .json({ error: "walletId does not belong to the authenticated user" });
    }

    try {
      const result = await privy
        .wallets()
        .rawSign(user.privyWallet.id, { params: { hash } });
      res.json({ signature: result.signature });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

// --- AVNU Paymaster proxy (opt-in) ---
// Set ENABLE_PAYMASTER=true. With AVNU_API_KEY: sponsored (gasfree) mode.
// Without it: gasless mode (user pays in tokens) still works.
if (ENABLE_PAYMASTER) {
  const AVNU_API_KEY = process.env.AVNU_API_KEY;
  const AVNU_PAYMASTER_URL =
    process.env.AVNU_PAYMASTER_URL || "https://sepolia.paymaster.avnu.fi";

  app.get("/api/health/paymaster", (_, res) =>
    res.json({
      status: "ok",
      url: AVNU_PAYMASTER_URL,
      mode: AVNU_API_KEY ? "sponsored" : "gasless",
    })
  );

  app.post("/api/paymaster", async (req, res) => {
    try {
      const size = Buffer.byteLength(JSON.stringify(req.body ?? {}));
      console.log(
        `[Paymaster] ${req.body?.method || "unknown"} (${(size / 1024).toFixed(0)}kb)`
      );

      const response = await fetch(AVNU_PAYMASTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(AVNU_API_KEY && { "x-paymaster-api-key": AVNU_API_KEY }),
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      if (!response.ok) {
        console.log(
          `[Paymaster] Error ${response.status}:`,
          JSON.stringify(data)
        );
      }

      res.status(response.status).json(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[Paymaster] Exception:`, message);
      res.status(500).json({ error: message });
    }
  });
}

app.get("/api/health", (_, res) => res.json({ status: "ok" }));

// Keep reference to server to prevent garbage collection
const server = app.listen(3001, () => {
  console.log(
    "Server running on http://localhost:3001 . Update your client's .env accordingly."
  );
  console.log(`  Privy:     ${ENABLE_PRIVY ? "on" : "off"}`);
  console.log(
    `  Paymaster: ${ENABLE_PAYMASTER ? `on (${process.env.AVNU_API_KEY ? "sponsored" : "gasless"} mode)` : "off"}`
  );
});

// Handle errors
server.on("error", (err) => {
  console.error("Server error:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
