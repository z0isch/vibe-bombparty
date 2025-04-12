import { useEffect, useState } from "react";
import * as moduleBindings from "./generated";

type PlayerData = moduleBindings.PlayerData;

let conn: moduleBindings.DbConnection | null = null;

function App() {
  const [players, setPlayers] = useState<Map<string, PlayerData>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionIdentity, setConnectionIdentity] = useState<string | null>(
    null
  );

  // Helper function to get current player from players map
  const getCurrentPlayer = () => {
    if (!connectionIdentity) return null;
    return players.get(connectionIdentity) || null;
  };

  useEffect(() => {
    const connect = async () => {
      try {
        conn = await moduleBindings.DbConnection.builder()
          .withUri("ws://localhost:3000")
          .withToken(localStorage.getItem("identity") || undefined)
          .withModuleName("vibe-bombparty")
          .onConnect(() => {
            setIsConnected(true);
            console.log("Connected to SpacetimeDB");

            // Store connection identity
            if (conn?.identity) {
              const identityStr = conn.identity.toHexString();
              setConnectionIdentity(identityStr);
              localStorage.setItem("identity", identityStr);
            }

            // Set up subscriptions after connection
            if (conn) {
              // Set up subscription
              conn
                .subscriptionBuilder()
                .onApplied(() => console.log("Subscription applied"))
                .subscribe("SELECT * FROM player");

              // Register callbacks
              conn.db.player.onInsert((ctx, player) => {
                setPlayers((prev) => {
                  const next = new Map(prev);
                  next.set(player.identity.toHexString(), player);
                  return next;
                });
              });

              conn.db.player.onDelete((ctx, player) => {
                setPlayers((prev) => {
                  const next = new Map(prev);
                  next.delete(player.identity.toHexString());
                  return next;
                });
              });
            }
          })
          .onDisconnect(() => {
            setIsConnected(false);
            setConnectionIdentity(null);
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Vibe Bombparty</h1>
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span>{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </header>

        {isConnected && !currentPlayer && (
          <button
            onClick={handleJoinGame}
            className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded"
          >
            Join Game
          </button>
        )}

        {currentPlayer && (
          <div className="mb-8">
            <h2 className="text-2xl mb-4">Your Profile</h2>
            <div className="bg-gray-800 p-4 rounded">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    currentPlayer.isOnline ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <p className="font-medium">{currentPlayer.username}</p>
                <span className="text-sm text-gray-400">
                  {currentPlayer.isOnline ? "Online" : "Offline"}
                </span>
              </div>
              <p className="text-gray-300">Score: {currentPlayer.score}</p>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl mb-4">Players ({players.size})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from(players.values()).map((player) => (
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
                  <span className="text-sm text-gray-400">
                    {player.isOnline ? "Online" : "Offline"}
                  </span>
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
