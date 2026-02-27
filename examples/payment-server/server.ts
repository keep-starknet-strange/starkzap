import "dotenv/config";
import express from "express";
import cors from "cors";
import { PaymentChains, PaymentTokenSymbols, StarkSDK } from "starkzap";

const CHAINRAILS_API_KEY = process.env.CHAINRAILS_API_KEY;

if (!CHAINRAILS_API_KEY) {
  console.warn("CHAINRAILS_API_KEY is not set.");
}

const app = express();
app.use(cors());
app.use(express.json());

if (!CHAINRAILS_API_KEY) {
  throw new Error(
    "CHAINRAILS_API_KEY is required to generate payment sessions"
  );
}

const sdk = new StarkSDK({
  network: "mainnet",
  payment: {
    apiKey: CHAINRAILS_API_KEY,
  },
});

app.get("/session-token", async (_, res) => {
  try {
    const session = await sdk.payment().createSession({
      amount: "0.1",
      recipient:
        "0x0075597a61229d143Ffba493C9f8A8057ecCeeA7BFDDBFD8Aaf79AC8935205c0",
      destinationChain: PaymentChains.STARKNET,
      token: PaymentTokenSymbols.USDC,
    });

    return res.json(session);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

// Keep reference to server to prevent garbage collection
const server = app.listen(3001, () => {
  console.log("Server running on http://localhost:3001.");
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
