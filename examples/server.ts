import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import { PrivyClient } from "@privy-io/node";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;
const AVNU_API_KEY = process.env.AVNU_API_KEY;
const AVNU_PAYMASTER_URL =
  process.env.AVNU_PAYMASTER_URL || "https://sepolia.paymaster.avnu.fi";
if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.error(
    "Run with: PRIVY_APP_ID=xxx PRIVY_APP_SECRET=xxx npx tsx server.ts"
  );
  process.exit(1);
}
if (!AVNU_API_KEY) {
  console.error("Run with: AVNU_API_KEY=xxx npx tsx server.ts");
  process.exit(1);
}

const privy = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET,
});
const app = express();
app.use(cors());
app.use(express.json());

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
async function auth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
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
}

// Get or create Starknet wallet (Privy key pair)
app.post("/api/wallet/starknet", auth, async (req, res) => {
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
    const wallet = await privy.wallets().create({ chain_type: "starknet" });
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
app.post("/api/wallet/register-account", auth, async (req, res) => {
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
app.post("/api/wallet/set-deployed", auth, async (req, res) => {
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
app.post("/api/wallet/sign", async (req, res) => {
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

// AVNU Paymaster proxy - forwards requests to AVNU with API key
// Set AVNU_API_KEY env var for sponsored (gasfree) mode
// Without API key, gasless mode (user pays in tokens) still works

app.post("/api/paymaster", async (req, res) => {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (AVNU_API_KEY) {
      headers["x-paymaster-api-key"] = AVNU_API_KEY;
    }

    console.log(
      `[Paymaster] ${req.body?.method || "unknown"} -> ${AVNU_PAYMASTER_URL}`
    );
    console.log(
      `[Paymaster] API key: ${AVNU_API_KEY ? `${AVNU_API_KEY.slice(0, 8)}...${AVNU_API_KEY.slice(-8)}` : "NOT SET"}`
    );

    const response = await fetch(AVNU_PAYMASTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paymaster-api-key": process.env.AVNU_API_KEY!,
      },
      body: JSON.stringify(req.body),
    });
    console.log(`[Paymaster] Response:`, response);

    const data = await response.json();
    console.log(`[Paymaster] Data:`, data);

    if (!response.ok) {
      console.log(
        `[Paymaster] Error ${response.status}:`,
        JSON.stringify(data)
      );
    }

    res.status(response.status).json(data);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.log(`[Paymaster] Exception:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/health", (_, res) => res.json({ status: "ok" }));

app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
  console.log(
    `AVNU Paymaster: ${AVNU_PAYMASTER_URL} (${AVNU_API_KEY ? "sponsored mode" : "gasless mode"})`
  );
});
