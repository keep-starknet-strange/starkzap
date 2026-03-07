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

/**
 * POST /api/wallet/sign
 * Sign a hash using Privy's rawSign endpoint
 *
 * Request body: { walletId: string, hash: string }
 * Response: { signature: string }
 */
export async function POST(request: NextRequest) {
  try {
    const privy = getPrivyClient();

    // Verify Privy auth token (optional: you may want to require auth here)
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    await privy.utils().auth().verifyAccessToken(token);

    // Parse request body
    const body = await request.json();
    const { walletId, hash } = body;

    if (!walletId || !hash) {
      return NextResponse.json(
        { error: 'walletId and hash are required' },
        { status: 400 }
      );
    }

    // Call Privy's rawSign API
    const result = await privy.wallets().rawSign(walletId, {
      params: { hash },
    });

    return NextResponse.json({ signature: result.signature });
  } catch (error) {
    console.error('POST /api/wallet/sign error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Signing failed' },
      { status: 500 }
    );
  }
}
