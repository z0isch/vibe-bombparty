import { useEffect, useState } from "react";
import * as moduleBindings from "./generated";
import { Identity } from "@clockworklabs/spacetimedb-sdk";

type PlayerData = moduleBindings.PlayerData;

let conn: moduleBindings.DbConnection | null = null;

function App() {
  const [players, setPlayers] = useState<Map<string, PlayerData>>(new Map());
  const [connectionIdentity, setConnectionIdentity] = useState<string | null>(
    null
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Helper function to get current player from players map
  const getCurrentPlayer = () => {
    if (!connectionIdentity) return null;
    return players.get(connectionIdentity) || null;
  };

  // Set up subscription and callbacks
  useEffect(() => {
    if (!conn || isSubscribed) return;

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
      .subscribe("SELECT * FROM player");

    // Register callbacks
    conn.db.player.onInsert((ctx, player) => {
      console.log("Player inserted:", player.username);
      setPlayers((prev) => {
        const next = new Map(prev);
        next.set(player.identity.toHexString(), player);
        return next;
      });
    });

    conn.db.player.onUpdate((ctx, player) => {
      console.log("Player updated:", player.username, {
        isOnline: player.isOnline,
      });
      setPlayers((prev) => {
        const next = new Map(prev);
        next.set(player.identity.toHexString(), player);
        return next;
      });
    });

    conn.db.player.onDelete((ctx, player) => {
      console.log("Player deleted:", player.username);
      setPlayers((prev) => {
        const next = new Map(prev);
        next.delete(player.identity.toHexString());
        return next;
      });
    });
  }, [conn, isSubscribed]);

  // Set up connection
  useEffect(() => {
    const connect = async () => {
      try {
        conn = await moduleBindings.DbConnection.builder()
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

              // Store connection identity and token
              const identityStr = identity.toHexString();
              setConnectionIdentity(identityStr);
              localStorage.setItem("token", token);
            }
          )
          .onDisconnect(() => {
            setConnectionIdentity(null);
            setIsSubscribed(false);
            setPlayers(new Map());
            console.log("Disconnected from SpacetimeDB");
          })
          .build();
      } catch (error) {
        console.error("Failed to connect:", error);
      }
    };

    connect();

    return () => {
      conn?.disconnect();
      conn = null;
    };
  }, []);

  const handleJoinGame = async () => {
    if (!conn || !connectionIdentity) return;

    const username = prompt("Enter your username:");
    if (!username) return;

    try {
      await conn.reducers.registerPlayer(username);
    } catch (error) {
      console.error("Failed to join game:", error);
    }
  };

  const currentPlayer = getCurrentPlayer();

  console.log({
    connectionIdentity,
    playersCount: players.size,
    currentPlayerId: currentPlayer?.identity.toHexString(),
    players: Array.from(players.entries()).map(([id, p]) => ({
      id,
      username: p.username,
      isOnline: p.isOnline,
      isCurrent: id === connectionIdentity,
    })),
  });

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
          <h2 className="text-2xl mb-4">Players ({players.size})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from(players.values())
              .sort((a, b) => {
                // Current player first
                if (a.identity.toHexString() === connectionIdentity) return -1;
                if (b.identity.toHexString() === connectionIdentity) return 1;
                // Then sort by username
                return a.username.localeCompare(b.username);
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
