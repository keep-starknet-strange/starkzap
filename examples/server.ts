import express from "express";
import cors from "cors";
import fs from "fs";
import { PrivyClient } from "@privy-io/node";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.error(
    "Run with: PRIVY_APP_ID=xxx PRIVY_APP_SECRET=xxx npx tsx server.ts"
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

// Simple file-based wallet storage (use a real database in production)
const WALLETS_FILE = "./wallets.json";
const wallets = new Map<
  string,
  { id: string; address: string; publicKey: string }
>(
  fs.existsSync(WALLETS_FILE)
    ? Object.entries(JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8")))
    : []
);
const saveWallets = () =>
  fs.writeFileSync(
    WALLETS_FILE,
    JSON.stringify(Object.fromEntries(wallets), null, 2)
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

// Get or create Starknet wallet
app.post("/api/wallet/starknet", auth, async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (req as any).userId;

  if (wallets.has(userId)) {
    return res.json({ wallet: wallets.get(userId), isNew: false });
  }

  try {
    const wallet = await privy.wallets().create({ chain_type: "starknet" });
    const data = {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.public_key as string,
    };
    wallets.set(userId, data);
    saveWallets();
    res.json({ wallet: data, isNew: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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

app.get("/api/health", (_, res) => res.json({ status: "ok" }));

app.listen(3001, () => console.log("Server running on http://localhost:3001"));
