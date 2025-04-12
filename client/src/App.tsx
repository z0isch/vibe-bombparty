import { useEffect, useState } from "react";
import * as moduleBindings from "./generated";
import { GameData } from "./generated/game_data_type";
import { PlayerData } from "./generated/player_data_type";
import { Identity } from "@clockworklabs/spacetimedb-sdk";

interface SpacetimeDBState {
  game: GameData | null;
  connectionIdentity: string | null;
  isSubscribed: boolean;
  currentPlayer: PlayerData | null;
  isConnected: boolean;
}

interface SpacetimeDBActions {
  registerPlayer: (username: string) => Promise<void>;
}

function useSpacetimeDB(): [SpacetimeDBState, SpacetimeDBActions] {
  const [conn, setConn] = useState<moduleBindings.DbConnection | null>(null);
  const [game, setGame] = useState<GameData | null>(null);
  const [connectionIdentity, setConnectionIdentity] = useState<string | null>(
    null
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Helper function to get current player from game
  const getCurrentPlayer = () => {
    if (!connectionIdentity || !game) return null;
    return (
      game.players.find(
        (p) => p.identity.toHexString() === connectionIdentity
      ) || null
    );
  };

  // Set up subscription and callbacks
  useEffect(() => {
    if (!conn || !isConnected || isSubscribed) return;

    console.log("Setting up subscription...");

    // Set up subscription
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        console.log("Subscription applied");
        setIsSubscribed(true);
      })
      .onError((error) => {
        console.error("Subscription error:", error);
        setIsSubscribed(false);
      })
      .subscribe("SELECT * FROM game");

    // Register callbacks
    conn.db.game.onInsert((ctx, gameData) => {
      console.log("Game updated:", { playerCount: gameData.players.length });
      setGame(gameData);
    });

    conn.db.game.onUpdate((ctx, oldGameData, newGameData) => {
      console.log("Game updated:", { playerCount: newGameData.players.length });
      setGame(newGameData);
    });

    conn.db.game.onDelete((ctx, gameData) => {
      console.log("Game deleted");
      setGame(null);
    });
  }, [conn, isConnected, isSubscribed]);

  // Set up connection
  useEffect(() => {
    const connect = async () => {
      try {
        const connection = await moduleBindings.DbConnection.builder()
          .withUri("ws://localhost:3000")
          .withToken(localStorage.getItem("token") || undefined)
          .withModuleName("vibe-bombparty")
          .onConnect(
            (
              connection: moduleBindings.DbConnection,
              identity: Identity,
              token: string
            ) => {
              console.log("Connected to SpacetimeDB");
              setIsConnected(true);

              // Store connection identity and token
              const identityStr = identity.toHexString();
              setConnectionIdentity(identityStr);
              localStorage.setItem("token", token);
            }
          )
          .onDisconnect(() => {
            setConnectionIdentity(null);
            setIsSubscribed(false);
            setGame(null);
            setIsConnected(false);
            console.log("Disconnected from SpacetimeDB");
          })
          .build();

        setConn(connection);
      } catch (error) {
        console.error("Failed to connect:", error);
      }
    };

    connect();

    return () => {
      conn?.disconnect();
      setConn(null);
    };
  }, []);

  const registerPlayer = async (username: string) => {
    if (!conn) throw new Error("Not connected to SpacetimeDB");
    await conn.reducers.registerPlayer(username);
  };

  return [
    {
      game,
      connectionIdentity,
      isSubscribed,
      currentPlayer: getCurrentPlayer(),
      isConnected,
    },
    {
      registerPlayer,
    },
  ];
}

function App() {
  const [
    { game, connectionIdentity, currentPlayer, isConnected },
    { registerPlayer },
  ] = useSpacetimeDB();

  const handleJoinGame = async () => {
    if (!isConnected) return;

    const username = prompt("Enter your username:");
    if (!username) return;

    try {
      await registerPlayer(username);
    } catch (error) {
      console.error("Failed to join game:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Vibe Bombparty</h1>
        </header>

        {connectionIdentity && !currentPlayer && (
          <button
            onClick={handleJoinGame}
            className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded"
          >
            Join Game
          </button>
        )}

        <div>
          <h2 className="text-2xl mb-4">
            Players ({game?.players.length ?? 0})
          </h2>
          <div className="flex flex-col gap-2">
            {game?.players
              .sort((a, b) => {
                // Current player first
                if (a.identity.toHexString() === connectionIdentity) return -1;
                if (b.identity.toHexString() === connectionIdentity) return 1;

                // Find the index of the current player
                const currentPlayerIndex = game.players.findIndex(
                  (p) => p.identity.toHexString() === connectionIdentity
                );

                // Get original indices of a and b
                const indexA = game.players.findIndex(
                  (p) => p.identity.toHexString() === a.identity.toHexString()
                );
                const indexB = game.players.findIndex(
                  (p) => p.identity.toHexString() === b.identity.toHexString()
                );

                // Calculate relative positions after current player
                const relativeA =
                  (indexA - currentPlayerIndex + game.players.length) %
                  game.players.length;
                const relativeB =
                  (indexB - currentPlayerIndex + game.players.length) %
                  game.players.length;

                // Sort by relative position
                return relativeA - relativeB;
              })
              .map((player) => (
                <div
                  key={player.identity.toHexString()}
                  className={`bg-gray-800 p-4 rounded ${
                    currentPlayer?.identity.toHexString() ===
                    player.identity.toHexString()
                      ? "ring-2 ring-blue-500"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        player.isOnline ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <p className="font-medium">{player.username}</p>
                  </div>
                  <p className="text-gray-300">Score: {player.score}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
