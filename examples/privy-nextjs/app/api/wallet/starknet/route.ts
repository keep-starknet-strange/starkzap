import { NextRequest, NextResponse } from "next/server";
import { getPrivyClient } from "@/lib/privy";

// Simple in-memory wallet storage (use a database in production!)
// In production, replace with: Redis, PostgreSQL, MongoDB, etc.
const walletStore = new Map<
  string,
  {
    walletId: string;
    publicKey: string;
    address: string;
  }
>();

// Warn about in-memory storage in production
if (process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️ WARNING: Using in-memory wallet storage. " +
      "Wallets will be lost on server restart. " +
      "Configure a persistent database (Redis/PostgreSQL/MongoDB) for production."
  );
}

/**
 * GET /api/wallet/starknet
 * Get the embedded Starknet wallet for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const privy = getPrivyClient();

    // Verify Privy auth token from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const claims = await privy.utils().auth().verifyAccessToken(token);
    const userId = claims.userId;

    // Check for existing wallet
    const existing = walletStore.get(userId);
    if (existing) {
      return NextResponse.json({
        wallet: existing,
        isNew: false,
      });
    }

    // No wallet found
    return NextResponse.json({
      wallet: null,
      isNew: false,
      message: "No Starknet wallet found. POST to create one.",
    });
  } catch (error) {
    console.error("GET /api/wallet/starknet error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallet/starknet
 * Create an embedded Starknet wallet for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const privy = getPrivyClient();

    // Verify Privy auth token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const claims = await privy.utils().auth().verifyAccessToken(token);
    const userId = claims.userId;

    // Check for existing wallet first
    const existing = walletStore.get(userId);
    if (existing) {
      return NextResponse.json({
        wallet: existing,
        isNew: false,
        message: "Wallet already exists",
      });
    }

    // Create new embedded Starknet wallet via Privy
    const wallet = await privy.wallets().create({ chain_type: "starknet" });

    const walletData = {
      walletId: wallet.id,
      publicKey: wallet.public_key as string,
      address: wallet.address,
    };

    // Store wallet (in production, save to database)
    walletStore.set(userId, walletData);

    return NextResponse.json({
      wallet: walletData,
      isNew: true,
    });
  } catch (error) {
    console.error("POST /api/wallet/starknet error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create wallet",
      },
      { status: 500 }
    );
  }
}
