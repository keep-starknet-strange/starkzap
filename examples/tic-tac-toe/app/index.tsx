import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
} from "react-native";
import { Text, View } from "@/components/Themed";
import TicTacToeBoard from "@/components/TicTacToeBoard";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import {
  type GameId,
  useTicTacToe,
} from "@/app/context/TicTacToeContractConnector";
import { useStarknetConnector } from "@/app/context/StarknetConnector";
import AccountGate from "@/components/AccountGate";
import { normalizeAddress } from "@/utils/address";

type CellValue = "X" | "O" | null;
type PendingMove = {
  gameId: GameId;
  cell: number;
  symbol: "X" | "O";
  isPending: boolean;
};

function calculateWinner(board: CellValue[]): {
  winner: "X" | "O" | null;
  line: number[] | null;
} {
  const lines: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    const candidate = board[a];
    if (candidate && candidate === board[b] && candidate === board[c]) {
      return { winner: candidate, line: [a, b, c] };
    }
  }
  return { winner: null, line: null };
}

function isBoardFull(board: CellValue[]): boolean {
  return board.every((v) => v !== null);
}

function bitsToBoard(xBits: number, oBits: number): CellValue[] {
  const arr: CellValue[] = Array(9).fill(null);
  for (let i = 0; i < 9; i++) {
    if ((xBits & (1 << i)) !== 0) arr[i] = "X";
    else if ((oBits & (1 << i)) !== 0) arr[i] = "O";
  }
  return arr;
}

export default function PlayScreen() {
  const { account, disconnectAccount, waitForTransaction } =
    useStarknetConnector();
  const [opponentAddress, setOpponentAddress] = useState("");
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<"X" | "O">("X");
  const [myRole, setMyRole] = useState<"X" | "O" | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [creatingGame, setCreatingGame] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const {
    createGame,
    playMove,
    getGame,
    currentGameId,
    loadGame,
    clearGame,
    contractAddress,
  } = useTicTacToe();
  const invitations: { id: GameId; from: string }[] = [];
  const [joinGameId, setJoinGameId] = useState("");

  const colorScheme = useColorScheme() ?? "light";
  const tint = Colors[colorScheme].tint;

  const boardWithPendingMove = useMemo(() => {
    if (!pendingMove || pendingMove.gameId !== currentGameId) {
      return board;
    }
    if (board[pendingMove.cell] === pendingMove.symbol) {
      return board;
    }
    const nextBoard = board.slice();
    nextBoard[pendingMove.cell] = pendingMove.symbol;
    return nextBoard;
  }, [board, currentGameId, pendingMove]);

  const { winner, line: winningLine } = useMemo(
    () => calculateWinner(board),
    [board]
  );
  const isDraw = useMemo(() => !winner && isBoardFull(board), [board, winner]);
  const isMyTurn = useMemo(
    () => (myRole ? currentPlayer === myRole : false),
    [currentPlayer, myRole]
  );

  const myAddress = useMemo(
    () => normalizeAddress(account?.address || ""),
    [account?.address]
  );
  const activePendingMove =
    pendingMove?.gameId === currentGameId ? pendingMove : null;

  const syncGame = useCallback(
    async (gameId: GameId): Promise<boolean> => {
      const game = await getGame(gameId);
      if (!game) {
        return false;
      }

      const nextBoard = bitsToBoard(game.x_bits, game.o_bits);
      setBoard(nextBoard);
      setCurrentPlayer(game.turn === 0 ? "X" : "O");

      const me = myAddress;
      const playerX = normalizeAddress(game.player_x || "");
      const playerO = normalizeAddress(game.player_o || "");
      const role = me === playerX ? "X" : me === playerO ? "O" : null;
      setMyRole(role);

      setPendingMove((current) => {
        if (!current || current.gameId !== gameId) {
          return current;
        }
        return nextBoard[current.cell] === current.symbol ? null : current;
      });

      return true;
    },
    [getGame, myAddress]
  );

  const submitMove = useCallback(
    async (gameId: GameId, cell: number, symbol: "X" | "O") => {
      const isCurrentMove = (current: PendingMove | null): boolean =>
        current?.gameId === gameId &&
        current.cell === cell &&
        current.symbol === symbol;

      const clearIfCurrent = () =>
        setPendingMove((current) => (isCurrentMove(current) ? null : current));

      const txHash = await playMove(gameId, cell);
      if (!txHash) {
        clearIfCurrent();
        return;
      }

      try {
        const txResult = await waitForTransaction(txHash);
        if (!txResult.success) {
          if (__DEV__ && txResult.reverted) {
            console.warn("play_move transaction reverted", txResult.receipt);
          }
          clearIfCurrent();
          await syncGame(gameId);
          return;
        }

        setPendingMove((current) =>
          isCurrentMove(current) ? { ...current, isPending: false } : current
        );
        await syncGame(gameId);
      } catch (waitError) {
        if (__DEV__) {
          console.warn("Failed waiting for play_move confirmation", waitError);
        }
        clearIfCurrent();
        try {
          await syncGame(gameId);
        } catch {
          // Polling will retry if the immediate sync attempt fails.
        }
      }
    },
    [playMove, syncGame, waitForTransaction]
  );

  // Poll game state while a game is selected.
  useEffect(() => {
    if (currentGameId == null) return;

    let cancelled = false;
    let inFlight = false;
    const sync = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await syncGame(currentGameId);
      } catch {
        // Ignore polling errors and try again on next interval.
      } finally {
        inFlight = false;
      }
    };

    void sync();
    const intervalId = setInterval(() => {
      void sync();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentGameId, syncGame]);

  async function handleStartGame() {
    if (!opponentAddress.trim() || creatingGame) return;
    setCreatingGame(true);
    try {
      const gameId = await createGame(opponentAddress);
      if (gameId != null) {
        loadGame(gameId);
        setBoard(Array(9).fill(null));
        setCurrentPlayer("X");
        setMyRole("X");
        setPendingMove(null);
        setGameStarted(true);
      } else {
        if (__DEV__) console.log("createGame returned null (no tx hash)");
      }
    } finally {
      setCreatingGame(false);
    }
  }

  async function handleJoinGame() {
    const id = joinGameId.trim();
    if (!/^[0-9]+$/.test(id)) return;

    try {
      const didLoad = await syncGame(id);
      if (!didLoad) {
        return;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn("Failed to load joined game", error);
      }
      return;
    }

    loadGame(id);
    setPendingMove(null);
    setGameStarted(true);
    setJoinGameId("");
  }

  function handleCellPress(index: number) {
    if (
      !gameStarted ||
      winner ||
      currentGameId == null ||
      !isMyTurn ||
      activePendingMove
    ) {
      return;
    }
    if (__DEV__)
      console.log("cell pressed", index, { currentGameId, isMyTurn });
    if (board[index] !== null) return;
    setPendingMove({
      gameId: currentGameId,
      cell: index,
      symbol: currentPlayer,
      isPending: true,
    });
    void submitMove(currentGameId, index, currentPlayer);
  }

  function handleNewGame() {
    clearGame();
    setOpponentAddress("");
    setGameStarted(false);
    setBoard(Array(9).fill(null));
    setCurrentPlayer("X");
    setMyRole(null);
    setPendingMove(null);
  }

  function getStatusText(): string {
    if (creatingGame) return "Waiting for game to be created…";
    if (activePendingMove?.isPending) return "Waiting for move confirmation…";
    if (activePendingMove) return "Move confirmed. Syncing board…";
    if (winner) return `Winner: ${winner}`;
    if (isDraw) return "Draw";
    if (!gameStarted) return "Enter an address to start";
    if (!myRole) return "Waiting for players";
    return isMyTurn
      ? `Your turn (${myRole})`
      : `Opponent's turn (${currentPlayer})`;
  }
  const statusText = getStatusText();
  if (!account?.address) {
    return <AccountGate />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {!contractAddress && (
          <View
            style={{
              padding: 10,
              borderRadius: 8,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: "rgba(255,165,0,0.6)",
            }}
          >
            <Text style={{ fontSize: 12 }}>
              Contract address not set. Configure
              EXPO_PUBLIC_TIC_TAC_TOE_CONTRACT_ADDRESS.
            </Text>
          </View>
        )}

        <View style={styles.walletPanel}>
          <Text style={styles.walletTitle}>Wallets</Text>
          {account?.address ? (
            <>
              <View style={styles.walletRow}>
                <Text style={styles.walletLabel}>Connected</Text>
                <Text selectable style={styles.walletValue}>
                  {account.address}
                </Text>
              </View>
              <Pressable
                onPress={disconnectAccount}
                style={({ pressed }) => [
                  styles.disconnectButton,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={styles.disconnectText}>Disconnect</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.walletValue}>No wallet connected</Text>
          )}
        </View>

        {currentGameId != null && (
          <View style={styles.gameIdRow}>
            <Text style={styles.label}>Game ID</Text>
            <Text selectable style={styles.gameIdValue}>
              {String(currentGameId)}
            </Text>
          </View>
        )}

        <View style={styles.inputRow}>
          <Text style={styles.label}>Opponent address</Text>
          <TextInput
            value={opponentAddress}
            onChangeText={setOpponentAddress}
            placeholder="0x..."
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                borderColor:
                  colorScheme === "dark"
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(0,0,0,0.2)",
                color: Colors[colorScheme].text,
                backgroundColor:
                  colorScheme === "dark"
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.03)",
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            onPress={handleStartGame}
            disabled={!opponentAddress.trim() || creatingGame}
            style={({ pressed }) => [
              styles.startButton,
              {
                backgroundColor: tint,
                opacity:
                  !opponentAddress.trim() || creatingGame
                    ? 0.5
                    : pressed
                      ? 0.8
                      : 1,
              },
            ]}
          >
            {creatingGame ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>
                {gameStarted ? "Restart" : "Start Game"}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.label}>Join game by ID</Text>
          <TextInput
            value={joinGameId}
            onChangeText={setJoinGameId}
            placeholder="e.g., 3"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            returnKeyType="done"
            style={[
              styles.input,
              {
                borderColor:
                  colorScheme === "dark"
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(0,0,0,0.2)",
                color: Colors[colorScheme].text,
                backgroundColor:
                  colorScheme === "dark"
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.03)",
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            onPress={handleJoinGame}
            disabled={!/^[0-9]+$/.test(joinGameId.trim())}
            style={({ pressed }) => [
              styles.startButton,
              {
                backgroundColor: tint,
                opacity: !/^[0-9]+$/.test(joinGameId.trim())
                  ? 0.5
                  : pressed
                    ? 0.8
                    : 1,
              },
            ]}
          >
            <Text style={styles.startButtonText}>Join Game</Text>
          </Pressable>
        </View>

        {invitations.length > 0 && !gameStarted && (
          <View style={styles.invitePanel}>
            <Text style={styles.inviteTitle}>Invitations</Text>
            {invitations.map((inv) => (
              <View key={inv.id} style={styles.inviteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteText}>Game #{inv.id} from</Text>
                  <Text selectable numberOfLines={1} style={styles.inviteFrom}>
                    {inv.from}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    loadGame(inv.id);
                    setGameStarted(true);
                  }}
                  style={({ pressed }) => [
                    styles.acceptButton,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={styles.acceptText}>Accept</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statusRow}>
          <View style={styles.statusContent}>
            <Text style={styles.status}>{statusText}</Text>
            {activePendingMove?.isPending ? (
              <ActivityIndicator color={tint} />
            ) : null}
          </View>
        </View>

        <TicTacToeBoard
          board={boardWithPendingMove}
          onCellPress={handleCellPress}
          disabled={
            !gameStarted || !!winner || !isMyTurn || !!activePendingMove
          }
          winningLine={winningLine}
          pendingCellIndex={
            activePendingMove?.isPending ? activePendingMove.cell : null
          }
          style={styles.board}
        />

        {gameStarted && (
          <Pressable
            onPress={handleNewGame}
            style={({ pressed }) => [
              styles.newGameButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.newGameText}>New Opponent</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  invitePanel: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(127,127,127,0.4)",
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  inviteText: {
    fontSize: 14,
    opacity: 0.85,
  },
  inviteFrom: {
    fontSize: 12,
    opacity: 0.8,
  },
  acceptButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#34c759",
  },
  acceptText: {
    color: "#fff",
    fontWeight: "700",
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  walletPanel: {
    marginTop: 50,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(127,127,127,0.4)",
  },
  walletTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  walletRow: {
    gap: 6,
    marginBottom: 6,
  },
  disconnectButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(127,127,127,0.4)",
  },
  disconnectText: {
    fontSize: 12,
    fontWeight: "600",
  },
  walletLabel: {
    fontSize: 12,
    opacity: 0.75,
  },
  walletValue: {
    fontSize: 12,
    opacity: 0.9,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
  },
  inputRow: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    opacity: 0.8,
  },
  input: {
    height: 44,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  startButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  startButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  status: {
    fontSize: 16,
    fontWeight: "600",
  },
  board: {
    marginTop: 8,
    marginBottom: 96,
  },
  newGameButton: {
    marginTop: 16,
    height: 44,
    alignSelf: "center",
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(127,127,127,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  newGameText: {
    fontSize: 15,
    fontWeight: "600",
  },
  addressRow: {
    gap: 6,
  },
  addressValue: {
    fontSize: 12,
    opacity: 0.9,
  },
  gameIdRow: {
    gap: 6,
  },
  gameIdValue: {
    fontSize: 12,
    opacity: 0.9,
  },
});
