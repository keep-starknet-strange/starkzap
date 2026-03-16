import React, { createContext, useCallback, useContext, useState } from "react";
import { addAddressPadding, type Call } from "starknet";
import { useStarknetConnector } from "./StarknetConnector";

const DEFAULT_TIC_TAC_TOE_CONTRACT_ADDRESS =
  "0x03727da24037502a3e38ac980239982e3974c8ca78bd87ab5963a7a8690fd8e8";

type Game = {
  player_x: string;
  player_o: string;
  x_bits: number;
  o_bits: number;
  turn: number; // 0 = X, 1 = O
  status: number; // 0 ongoing, 1 X won, 2 O won, 3 draw
  gameId: number;
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

  currentGameId: number | null;
  createGame: (opponentAddress: string) => Promise<number | null>; // returns game id or null
  playMove: (gameId: number, cell: number) => Promise<string | null>;
  getGame: (gameId: number) => Promise<Game | null>;
  loadGame: (gameId: number) => void;
};

const TicTacToeContext = createContext<TicTacToeContextType | undefined>(
  undefined
);

function normalizeAddress(value: string | undefined | null): string {
  const raw = (value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return addAddressPadding(raw.toLowerCase());
  } catch {
    try {
      const asHex = `0x${BigInt(raw).toString(16)}`;
      return addAddressPadding(asHex.toLowerCase());
    } catch {
      return raw.toLowerCase();
    }
  }
}

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
  const [currentGameId, setCurrentGameId] = useState<number | null>(null);

  const createGame = useCallback(
    async (opponentAddress: string): Promise<number | null> => {
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
      const tx = await wallet.execute([call]);
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

        let foundId: number | null = null;
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
              try {
                const gid = Number(BigInt(gidHex));
                foundId = gid;
                if (__DEV__) console.log("create_game parsed gameId:", gid);
                break;
              } catch {
                // Ignore malformed game id entries and continue scanning events.
              }
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
    async (gameId: number, cell: number): Promise<string | null> => {
      if (__DEV__)
        console.log("play_move called", {
          gameId,
          cell,
          contractAddress,
        });
      if (!contractAddress) return null;
      try {
        const call: Call = {
          contractAddress,
          entrypoint: "play_move",
          calldata: [gameId, cell],
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

  const loadGame = useCallback((gameId: number) => {
    setCurrentGameId(Number(gameId));
  }, []);

  const getGame = useCallback(
    async (gameId: number): Promise<Game | null> => {
      if (!provider || !contractAddress) return null;
      if (gameId == null || Number.isNaN(Number(gameId))) return null;
      try {
        const raw = (await provider.callContract({
          contractAddress,
          entrypoint: "get_game",
          calldata: [String(gameId)],
        })) as CallContractResultLike;
        const values: unknown[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.result)
            ? raw.result
            : [];
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
          gameId: Number(gameId),
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
      }}
    >
      {children}
    </TicTacToeContext.Provider>
  );
};
