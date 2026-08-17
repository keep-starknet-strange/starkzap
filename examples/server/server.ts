import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import { PrivyClient } from "@privy-io/node";
import {
  PrivySigningRequestError,
  resolvePrivySigningRequest,
} from "./privy-signing";

// Each feature is opt-in via an ENABLE_* flag. A flag that's off means its
// routes are never registered and its env vars are not required — so a plain
// `npm start` with no flags serves only /api/health.
const ENABLE_PRIVY = process.env.ENABLE_PRIVY === "true";
const ENABLE_PAYMASTER = process.env.ENABLE_PAYMASTER === "true";
const PRIVY_API_URL = (
  process.env.PRIVY_API_BASE_URL || "https://api.privy.io"
).replace(/\/+$/, "");

const app = express();
app.use(cors());

// A privacy proof is bigger than `express.json()`'s 100kb default, so submitting
// one needs a raised limit — measured at 300-320kb for a simple transfer, and
// larger for transactions carrying more actions. 4mb leaves an order of
// magnitude of headroom without turning the route into a sink; the real figure
// for your own transactions is in the `[Paymaster/*]` log line below.
//
// Scoped to the paymaster path and mounted first: body-parser skips a body that
// is already parsed, so every other route keeps the safe default. An integrator's
// own proxy needs the same allowance.
const PROOF_BODY_LIMIT = "4mb";
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
    apiUrl: PRIVY_API_URL,
  });

  app.get("/api/health/privy", (_, res) => res.json({ status: "ok" }));

  // Simple file-based wallet storage (use a real database in production)
  // Structure: { [userId]: { privyWallet: {...}, accounts: { [preset]: { address, deployed } } } }
  const WALLETS_FILE = "./wallets.json";
  type UserData = {
    privyWallet: { id: string; address: string; publicKey: string };
    accounts: Record<string, { address: string; deployed: boolean }>;
  };
  interface AuthenticatedRequest extends express.Request {
    userId: string;
    privyAccessToken: string;
  }

  const getAuthenticatedRequest = (
    req: express.Request
  ): AuthenticatedRequest => req as AuthenticatedRequest;
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
      const authenticatedReq = getAuthenticatedRequest(req);
      authenticatedReq.userId = claims.user_id;
      authenticatedReq.privyAccessToken = token;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Get or create Starknet wallet (Privy key pair)
  app.post("/api/privy-wallet/starknet", auth, async (req, res) => {
    const { userId } = getAuthenticatedRequest(req);

    const existing = users.get(userId);
    if (existing) {
      return res.json({
        wallet: existing.privyWallet,
        accounts: existing.accounts,
        isNew: false,
        privyApiUrl: PRIVY_API_URL,
      });
    }

    try {
      const wallet = await privy.wallets().create({
        chain_type: "starknet",
        owner: { user_id: userId },
      });
      const privyWallet = {
        id: wallet.id,
        address: wallet.address,
        publicKey: wallet.public_key as string,
      };
      users.set(userId, {
        privyWallet,
        accounts: {},
      });
      saveData();
      res.json({
        wallet: privyWallet,
        accounts: {},
        isNew: true,
        privyApiUrl: PRIVY_API_URL,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Register a computed account address for a preset
  app.post("/api/privy-wallet/register-account", auth, async (req, res) => {
    const { userId } = getAuthenticatedRequest(req);
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
    const { userId } = getAuthenticatedRequest(req);
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
    const { userId, privyAccessToken } = getAuthenticatedRequest(req);

    const user = users.get(userId);
    if (!user) {
      return res
        .status(404)
        .json({ error: "User not found, create wallet first" });
    }

    try {
      const { hash, authorizationContext } = resolvePrivySigningRequest(
        req.body,
        user.privyWallet.id,
        privyAccessToken
      );
      const result = await privy.wallets().rawSign(user.privyWallet.id, {
        params: { hash },
        authorization_context: authorizationContext,
      });
      res.json({ signature: result.signature });
    } catch (error: unknown) {
      res
        .status(error instanceof PrivySigningRequestError ? error.status : 500)
        .json({
          error: error instanceof Error ? error.message : String(error),
        });
    }
  });
}

// --- AVNU Paymaster proxy (opt-in) ---
// Set ENABLE_PAYMASTER=true. With AVNU_API_KEY: sponsored (gasfree) mode.
// Without it: gasless mode (user pays in tokens) still works.
//
// !! UNAUTHENTICATED, ON PURPOSE, AND ONLY SAFE ON LOCALHOST. !!
//
// The whole point of a proxy is that it holds the API key so the key does not
// ship in a browser bundle. That makes this route a way to spend the key: anyone
// who can reach it can submit sponsored transactions against your AVNU account
// and your gas budget, without ever seeing the key itself. Reachable from the
// internet, it is an open relay for your sponsorship.
//
// Before deploying anything shaped like this, gate it — a session check, a shared
// secret, an allowlist, a rate limit — and gate it on the *paymaster* route
// specifically, not just on the routes that happen to have login attached.
if (ENABLE_PAYMASTER) {
  const AVNU_API_KEY = process.env.AVNU_API_KEY;

  // One upstream per network, because the clients ship a single build that
  // switches networks at runtime. A shared URL cannot express that: point it at
  // Sepolia and a mainnet pool comes back "not whitelisted" (code 156) from two
  // layers away. One API key covers both networks.
  const UPSTREAMS: Record<string, string> = {
    mainnet:
      process.env.AVNU_PAYMASTER_URL_MAINNET ||
      "https://starknet.paymaster.avnu.fi",
    sepolia:
      process.env.AVNU_PAYMASTER_URL_SEPOLIA ||
      "https://sepolia.paymaster.avnu.fi",
  };

  app.get("/api/health/paymaster", (_, res) =>
    res.json({
      status: "ok",
      upstreams: UPSTREAMS,
      mode: AVNU_API_KEY ? "sponsored" : "gasless",
    })
  );

  // The bare path used to forward to a single upstream, which silently mixed
  // networks. Failing here names the problem instead of letting the paymaster
  // reject a pool it was never asked about.
  app.post("/api/paymaster", (_, res) =>
    res.status(400).json({
      error:
        "Name the network: POST /api/paymaster/mainnet or /api/paymaster/sepolia.",
    })
  );

  app.post("/api/paymaster/:network", async (req, res) => {
    const upstream = UPSTREAMS[req.params.network];
    if (!upstream) {
      return res.status(400).json({
        error: `Unknown network "${req.params.network}". Use mainnet or sepolia.`,
      });
    }

    try {
      // Content-Length rather than re-serialising the body: express already read
      // the figure off the wire, and stringifying a proof to measure it doubles
      // the memory the request costs.
      const size = Number(req.get("content-length") ?? 0);
      console.log(
        `[Paymaster/${req.params.network}] ${req.body?.method || "unknown"} (${(size / 1024).toFixed(0)}kb)`
      );

      const response = await fetch(upstream, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(AVNU_API_KEY && { "x-paymaster-api-key": AVNU_API_KEY }),
        },
        body: JSON.stringify(req.body),
      });

      // Read once as text and forward the upstream's own status and content type.
      // Anything in front of the paymaster can answer with an empty body or an
      // HTML error page — a 429 or a 502 from a CDN — and decoding that as JSON
      // here would hide the real status behind this proxy's own error. Your proxy
      // needs the same behaviour.
      const body = await response.text();
      if (!response.ok) {
        console.log(
          `[Paymaster] Error ${response.status}:`,
          body.slice(0, 500)
        );
      }

      const contentType = response.headers.get("content-type");
      res.status(response.status);
      if (contentType) res.type(contentType);
      res.send(body);
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
