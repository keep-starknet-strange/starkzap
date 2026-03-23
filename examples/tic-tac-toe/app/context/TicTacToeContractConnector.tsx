import React, { createContext, useCallback, useContext, useState } from "react";
import { type Call } from "starknet";
import { normalizeAddress } from "@/utils/address";
import { useStarknetConnector } from "@/app/context/StarknetConnector";

const DEFAULT_TIC_TAC_TOE_CONTRACT_ADDRESS =
  "0x03727da24037502a3e38ac980239982e3974c8ca78bd87ab5963a7a8690fd8e8";

export type GameId = string;

type Game = {
  player_x: string;
  player_o: string;
  x_bits: number;
  o_bits: number;
  turn: number; // 0 = X, 1 = O
  status: number; // 0 ongoing, 1 X won, 2 O won, 3 draw
  gameId: GameId;
};

type TransactionReceiptEvent = {
  data?: unknown[];
};

type TransactionReceiptLike = {
  events?: TransactionReceiptEvent[];
};

type CallContractResultLike = unknown[] | { result?: unknown[] };

type TicTacToeContextType = {
  contractAddress: string | null;
  contract: null;

  currentGameId: GameId | null;
  createGame: (opponentAddress: string) => Promise<GameId | null>; // returns game id or null
  playMove: (gameId: GameId, cell: number) => Promise<string | null>;
  getGame: (gameId: GameId) => Promise<Game | null>;
  loadGame: (gameId: GameId) => void;
  clearGame: () => void;
};

const normalizeGameId = (value: unknown): GameId | null => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint"
  ) {
    return null;
  }

  const scalar = String(value).trim();
  if (!scalar) return null;

  try {
    const parsed = BigInt(scalar);
    return parsed >= 0n ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const TicTacToeContext = createContext<TicTacToeContextType | undefined>(
  undefined
);

export const useTicTacToe = () => {
  const ctx = useContext(TicTacToeContext);
  if (!ctx)
    throw new Error("useTicTacToe must be used within TicTacToeProvider");
  return ctx;
};

export const TicTacToeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { provider, wallet } = useStarknetConnector();

  const [contractAddress] = useState<string | null>(
    process.env.EXPO_PUBLIC_TIC_TAC_TOE_CONTRACT_ADDRESS ||
      DEFAULT_TIC_TAC_TOE_CONTRACT_ADDRESS
  );
  const [currentGameId, setCurrentGameId] = useState<GameId | null>(null);

  const createGame = useCallback(
    async (opponentAddress: string): Promise<GameId | null> => {
      if (!contractAddress) {
        if (__DEV__) console.error("TicTacToe contract address is not set");
        return null;
      }
      if (!wallet) return null;
      const call: Call = {
        contractAddress,
        entrypoint: "create_game",
        calldata: [opponentAddress],
      };
      let tx: Awaited<ReturnType<typeof wallet.execute>>;
      try {
        tx = await wallet.execute([call]);
      } catch (e) {
        if (__DEV__) console.error("create_game error", e);
        return null;
      }
      const txHash = tx.hash || null;
      if (__DEV__) console.log("create_game txHash:", txHash);
      if (!txHash || !provider) return null;

      try {
        // Ensure the transaction is confirmed on-chain
        await tx.wait();
      } catch {
        // continue to attempt parsing receipt anyway
      }

      try {
        const receipt = await (
          provider as {
            getTransactionReceipt: (
              hash: string
            ) => Promise<TransactionReceiptLike>;
          }
        ).getTransactionReceipt(txHash);
        if (__DEV__) console.log("create_game receipt:", receipt);
        const expectedX = normalizeAddress(wallet.address || "");
        const expectedO = normalizeAddress(opponentAddress);

        let foundId: GameId | null = null;
        const events = Array.isArray(receipt?.events) ? receipt.events : [];
        if (__DEV__) console.log("create_game events count:", events.length);
        for (const ev of events) {
          const data: string[] = (Array.isArray(ev?.data) ? ev.data : []).map(
            (d) => (typeof d === "string" ? d : String(d))
          );
          if (__DEV__) console.log("create_game event data:", data);
          if (data.length >= 3) {
            const [gidHex, xAddr, oAddr] = data;
            const xNorm = normalizeAddress(xAddr);
            const oNorm = normalizeAddress(oAddr);
            if (xNorm === expectedX && oNorm === expectedO) {
              const gid = normalizeGameId(gidHex);
              if (!gid) continue;
              foundId = gid;
              if (__DEV__) console.log("create_game parsed gameId:", gid);
              break;
            }
          }
        }

        if (foundId !== null) {
          setCurrentGameId(foundId);
          return foundId;
        }
      } catch (e) {
        if (__DEV__) console.warn("Failed to parse GameCreated event", e);
      }

      return null;
    },
    [contractAddress, provider, wallet]
  );

  const playMove = useCallback(
    async (gameId: GameId, cell: number): Promise<string | null> => {
      const normalizedGameId = normalizeGameId(gameId);
      if (__DEV__)
        console.log("play_move called", {
          gameId: normalizedGameId ?? gameId,
          cell,
          contractAddress,
        });
      if (!contractAddress || !normalizedGameId) return null;
      try {
        const call: Call = {
          contractAddress,
          entrypoint: "play_move",
          calldata: [normalizedGameId, String(cell)],
        };
        if (!wallet) return null;
        const tx = await wallet.execute([call]);
        const txHash = tx.hash || null;
        if (!txHash) return null;
        return txHash;
      } catch (e) {
        if (__DEV__) console.error("play_move error", e);
        return null;
      }
    },
    [contractAddress, wallet]
  );

  const loadGame = useCallback((gameId: GameId) => {
    const normalizedGameId = normalizeGameId(gameId);
    if (!normalizedGameId) return;
    setCurrentGameId(normalizedGameId);
  }, []);

  const clearGame = useCallback(() => {
    setCurrentGameId(null);
  }, []);

  const getGame = useCallback(
    async (gameId: GameId): Promise<Game | null> => {
      if (!provider || !contractAddress) return null;
      const normalizedGameId = normalizeGameId(gameId);
      if (!normalizedGameId) return null;
      try {
        const raw = (await provider.callContract({
          contractAddress,
          entrypoint: "get_game",
          calldata: [normalizedGameId],
        })) as CallContractResultLike;
        let values: unknown[];
        if (Array.isArray(raw)) {
          values = raw;
        } else if (Array.isArray(raw?.result)) {
          values = raw.result;
        } else {
          values = [];
        }
        if (values.length < 6) return null;

        const toScalarString = (v: unknown): string => {
          if (typeof v === "string") return v;
          if (
            typeof v === "number" ||
            typeof v === "bigint" ||
            typeof v === "boolean"
          ) {
            return String(v);
          }
          return "";
        };
        const toNum = (v: unknown) =>
          typeof v === "bigint" ? Number(v) : Number(toScalarString(v));
        const toHex = (v: unknown) => {
          try {
            const b = BigInt(toScalarString(v));
            return "0x" + b.toString(16);
          } catch {
            return String(v);
          }
        };
        const game: Game = {
          player_x: normalizeAddress(toHex(values[0])),
          player_o: normalizeAddress(toHex(values[1])),
          x_bits: toNum(values[2]),
          o_bits: toNum(values[3]),
          turn: toNum(values[4]),
          status: toNum(values[5]),
          gameId: normalizedGameId,
        };
        return game;
      } catch (e) {
        if (__DEV__) {
          const msg = e instanceof Error ? e.message : String(e || "");
          // Suppress noisy logs when the contract returns 'unknown_game'
          if (!/unknown_game/i.test(msg)) {
            console.error("get_game failed", e);
          }
        }
        return null;
      }
    },
    [provider, contractAddress]
  );

  return (
    <TicTacToeContext.Provider
      value={{
        contractAddress,
        contract: null,
        currentGameId,
        createGame,
        playMove,
        getGame,
        loadGame,
        clearGame,
      }}
    >
      {children}
    </TicTacToeContext.Provider>
  );
};
