import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/node';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

// Lazy-initialize Privy client to avoid build-time errors
let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
      throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be set');
    }
    privyClient = new PrivyClient({
      appId: PRIVY_APP_ID,
      appSecret: PRIVY_APP_SECRET,
    });
  }
  return privyClient;
}

// Simple in-memory wallet storage (use a database in production!)
// In production, replace with: Redis, PostgreSQL, MongoDB, etc.
const walletStore = new Map<string, {
  walletId: string;
  publicKey: string;
  address: string;
}>();

/**
 * GET /api/wallet/starknet
 * Get the embedded Starknet wallet for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const privy = getPrivyClient();

    // Verify Privy auth token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const claims = await privy.utils().auth().verifyAccessToken(token);
    const userId = claims.user_id;

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
      message: 'No Starknet wallet found. POST to create one.',
    });
  } catch (error) {
    console.error('GET /api/wallet/starknet error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
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
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const claims = await privy.utils().auth().verifyAccessToken(token);
    const userId = claims.user_id;

    // Check for existing wallet first
    const existing = walletStore.get(userId);
    if (existing) {
      return NextResponse.json({
        wallet: existing,
        isNew: false,
        message: 'Wallet already exists',
      });
    }

    // Create new embedded Starknet wallet via Privy
    const wallet = await privy.wallets().create({ chain_type: 'starknet' });

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
    console.error('POST /api/wallet/starknet error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create wallet' },
      { status: 500 }
    );
  }
}
