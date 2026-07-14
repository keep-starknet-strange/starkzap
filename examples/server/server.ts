import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { PrivyClient } from "@privy-io/node";

// Each feature is opt-in via an ENABLE_* flag. A flag that's off means its
// routes are never registered and its env vars are not required — so a plain
// `npm start` with no flags serves only /api/health.
const ENABLE_PRIVY = process.env.ENABLE_PRIVY === "true";
const ENABLE_PAYMASTER = process.env.ENABLE_PAYMASTER === "true";
const ENABLE_PRIVACY_STACK = process.env.ENABLE_PRIVACY_STACK === "true";

const app = express();
app.use(cors());
app.use(express.json());

// --- Privacy proving stack (opt-in) ---
// Set ENABLE_PRIVACY_STACK=true and PROVER_RPC_URL=<real Starknet RPC> to spawn
// the local SNIP-36 prover (install it first with `npm run prepare:privacy-stack`).
// PROVER_RPC_URL is renamed to STARKNET_RPC_URL for the child. PROVER_CHAIN_ID
// (default SN_SEPOLIA) must match that RPC's network — SN_MAIN for a mainnet RPC.
// Account/key are unused by proving, so we default them.
if (ENABLE_PRIVACY_STACK) {
  const STACK_DIR = path.resolve(".privacy-stack");
  const proverBin = path.join(STACK_DIR, "bin/snip36-playground");
  const wrapper = path.join(STACK_DIR, "scripts/run-virtual-os.sh");
  const proverRpc = process.env.PROVER_RPC_URL;

  if (!fs.existsSync(proverBin) || !fs.existsSync(wrapper)) {
    console.error(
      "ENABLE_PRIVACY_STACK is set but the stack is not installed. Run: npm run prepare:privacy-stack"
    );
    process.exit(1);
  }
  if (!proverRpc) {
    console.error(
      "ENABLE_PRIVACY_STACK is set but PROVER_RPC_URL is missing (needs a real Sepolia RPC, spec v0.8+)."
    );
    process.exit(1);
  }

  const proverPort = process.env.PROVER_PORT ?? "8090";
  const proverChainId = process.env.PROVER_CHAIN_ID ?? "SN_SEPOLIA";
  const prover = spawn(proverBin, [], {
    env: {
      ...process.env,
      SNIP36_PROJECT_DIR: STACK_DIR,
      STARKNET_RPC_URL: proverRpc, // prover expects STARKNET_RPC_URL
      STARKNET_CHAIN_ID: proverChainId, // playground config; must match the RPC's network
      PROVER_CHAIN_ID: proverChainId, // read by the patched run-virtual-os.sh
      STARKNET_ACCOUNT_ADDRESS: "0x1", // required by config loader, unused by proving
      STARKNET_PRIVATE_KEY: "0x1", // required by config loader, unused by proving
      PORT: proverPort,
    },
    stdio: "inherit",
  });
  prover.on("error", (err) =>
    console.error("Failed to spawn privacy prover:", err)
  );
  process.on("exit", () => prover.kill());
  console.log(`Privacy proving stack spawned on :${proverPort}`);

  // Forward to the locally spawned prover's own /api/health. We deliberately do
  // NOT forward the prover's rpc_url — it echoes it and it contains the RPC key.
  app.get("/api/health/prover", async (_, res) => {
    try {
      const upstream = await fetch(`http://127.0.0.1:${proverPort}/api/health`);
      const data = (await upstream.json()) as { status?: string };
      res.status(upstream.status).json({ status: data.status ?? "ok" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(503).json({ status: "unreachable", error: message });
    }
  });
}

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

  // Sign a hash
  app.post("/api/privy-wallet/sign", async (req, res) => {
    const { walletId, hash } = req.body;
    if (!walletId || !hash)
      return res.status(400).json({ error: "walletId and hash required" });

    try {
      const result = await privy
        .wallets()
        .rawSign(walletId, { params: { hash } });
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
      console.log(`[Paymaster] ${req.body?.method || "unknown"}`);

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
  console.log(`  Privacy:   ${ENABLE_PRIVACY_STACK ? "on" : "off"}`);
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
