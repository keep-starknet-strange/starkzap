/**
 * StarkZap SDK + Cartridge + game contract integration.
 * See: mintlify-docs/build/consumer-app-sdk/starkzap (Quick Start, Cartridge Controller, Examples)
 *
 * Uses only StarkZap: SDK, wallet, provider (wallet.getProvider()), Contract and RpcProvider re-exported for read-only calls.
 */
import {
  StarkZap,
  OnboardStrategy,
  ChainId,
  networks,
  Contract,
  type WalletInterface,
} from "starkzap";
import { getChecksumAddress, type RpcProvider } from "starknet";

// FOS demo game contract on Sepolia (same as https://github.com/0xsisyfos/fos)
// Checksummed address so execute() calls match Cartridge session policies (Controller normalizes policy targets with getChecksumAddress).
export const GAME_CONTRACT = getChecksumAddress(
  "0x03730b941e8d3ece030a4a0d5f1008f34fbde0976e86577a78648c8b35079464"
);

const GAME_POLICIES = [
  { target: GAME_CONTRACT, method: "end_game" },
  { target: GAME_CONTRACT, method: "increment_score" },
  { target: GAME_CONTRACT, method: "start_new_game" },
];

// ABI for view calls — matches FOS (https://github.com/0xsisyfos/fos/blob/main/src/hooks/useGameContract.js)
const GAME_ABI = [
  {
    type: "function",
    name: "get_high_score",
    inputs: [
      { name: "address", type: "felt" },
      { name: "leaderboard_id", type: "felt" },
    ],
    outputs: [{ name: "score", type: "felt" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "get_current_leaderboard_id",
    inputs: [],
    outputs: [{ name: "id", type: "felt" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "get_leaderboard",
    inputs: [],
    outputs: [
      { type: "core::array::Array::<(core::starknet::contract_address::ContractAddress, core::integer::u32)>" },
    ],
    stateMutability: "view",
  },
];

let sdk: StarkZap | null = null;
let wallet: WalletInterface | null = null;

/** If true, account is not SNIP-9 compatible; use user_pays so transactions succeed. */
let useUserPaysForSession = false;

function isSnip9IncompatibleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /SNIP-9|not compatible with SNIP/i.test(msg);
}

async function executeGameCall(
  entrypoint: string,
  calldata: unknown[] = []
): Promise<void> {
  if (!wallet) return;
  const feeMode = useUserPaysForSession ? "user_pays" : "sponsored";
  try {
    await wallet.execute(
      [
        {
          contractAddress: GAME_CONTRACT, // already checksummed; must match session policy target
          entrypoint,
          calldata,
        },
      ],
      { feeMode }
    );
  } catch (err) {
    if (!useUserPaysForSession && isSnip9IncompatibleError(err)) {
      useUserPaysForSession = true;
      console.warn(
        "[Starknet] Account is not SNIP-9 compatible; retrying with user_pays (you may be prompted to pay gas)."
      );
      return executeGameCall(entrypoint, calldata);
    }
    throw err;
  }
}

export function initSdk(): StarkZap {
  if (!sdk) {
    sdk = new StarkZap({ network: "sepolia" });
  }
  return sdk;
}

export function getWallet(): WalletInterface | null {
  return wallet;
}

export function isConnected(): boolean {
  return wallet != null;
}

/** Connected wallet address as string (0x-prefixed hex), or undefined if disconnected. */
export function getAddress(): string | undefined {
  if (!wallet) return undefined;
  const addr = wallet.address;
  return typeof addr === "string" ? addr : addr?.toString?.() ?? undefined;
}

/** Cartridge username when connected (optional). */
export async function getUsername(): Promise<string | undefined> {
  if (!wallet || typeof (wallet as { username?: () => Promise<string | undefined> }).username !== "function")
    return undefined;
  return (wallet as { username: () => Promise<string | undefined> }).username();
}

/**
 * Connect via Cartridge Controller (social login / passkey).
 * Policies allow gasless calls to the game contract.
 */
export async function connectCartridge(): Promise<WalletInterface> {
  const sdkInstance = initSdk();
  const onboard = await sdkInstance.onboard({
    strategy: OnboardStrategy.Cartridge,
    cartridge: { policies: GAME_POLICIES },
    deploy: "never",
  });
  wallet = onboard.wallet;
  return wallet;
}

export async function disconnect(): Promise<void> {
  if (wallet && "disconnect" in wallet && typeof wallet.disconnect === "function") {
    await wallet.disconnect();
  }
  wallet = null;
  useUserPaysForSession = false;
}

/**
 * Start a new game session on-chain (optional; aligns with FOS flow).
 * Uses sponsored (gasless) when the account is SNIP-9 compatible; otherwise falls back to user_pays.
 */
export async function startNewGame(): Promise<void> {
  try {
    await executeGameCall("start_new_game", []);
  } catch (err) {
    console.warn("[Starknet] start_new_game failed:", err);
  }
}

/**
 * Increment score on-chain when passing a pipe. Fire-and-forget; do not block game loop.
 * Uses sponsored when SNIP-9 compatible, else user_pays.
 */
export async function incrementScore(): Promise<void> {
  executeGameCall("increment_score", []).catch((err) => {
    console.warn("[Starknet] increment_score failed:", err);
  });
}

/**
 * End game on-chain (call on game over).
 * Uses sponsored when SNIP-9 compatible, else user_pays.
 */
export async function endGame(): Promise<void> {
  executeGameCall("end_game", []).catch((err) => {
    console.warn("[Starknet] end_game failed:", err);
  });
}

function getGameContract(provider: RpcProvider): Contract {
  return new Contract({
    abi: GAME_ABI,
    address: GAME_CONTRACT,
    providerOrAccount: provider,
  });
}

/**
 * Get on-chain high score for an address (default: connected wallet).
 * Parsing matches FOS: result.score, result.id.
 */
export async function getHighScore(
  address?: string
): Promise<number> {
  if (!wallet) return 0;
  const provider = wallet.getProvider();
  const contract = getGameContract(provider);
  const addr = address ?? wallet.address.toString();
  try {
    const leaderboardResult = await contract.get_current_leaderboard_id();
    const id =
      typeof leaderboardResult === "object" && leaderboardResult !== null && "id" in leaderboardResult
        ? (leaderboardResult as { id: unknown }).id
        : leaderboardResult;
    const result = await contract.get_high_score(addr, id);
    const score =
      typeof result === "object" && result !== null && "score" in result
        ? (result as { score: unknown }).score
        : Array.isArray(result)
          ? result[0]
          : result;
    return Number(score ?? 0);
  } catch {
    return 0;
  }
}

export interface LeaderboardEntry {
  address: string;
  score: number;
}

/**
 * Get on-chain leaderboard (current period).
 * Parsing matches FOS: result is array of [address, score], address as 0x + toString(16).
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!wallet) return [];
  const provider = wallet.getProvider();
  const contract = getGameContract(provider);
  try {
    const result = await contract.get_leaderboard();
    const arr = Array.isArray(result) ? result : (result as { 0?: unknown[] })?.[0];
    if (!Array.isArray(arr)) return [];
    return arr.map((entry: unknown) => {
      const tuple = Array.isArray(entry) ? entry : (entry as { 0?: unknown; 1?: unknown });
      const addr = tuple[0];
      const scoreVal = tuple[1];
      const addressStr =
        addr != null
          ? typeof addr === "bigint"
            ? `0x${addr.toString(16)}`
            : `0x${BigInt(Number(addr)).toString(16)}`
          : "0x0";
      return {
        address: addressStr,
        score: Number(scoreVal ?? 0),
      };
    });
  } catch {
    return [];
  }
}
