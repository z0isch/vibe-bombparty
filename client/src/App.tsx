import { useEffect, useState } from "react";
import * as moduleBindings from "./generated";

type PlayerData = moduleBindings.PlayerData;

let conn: moduleBindings.DbConnection | null = null;

function App() {
  const [players, setPlayers] = useState<Map<string, PlayerData>>(new Map());
  const [localPlayer, setLocalPlayer] = useState<PlayerData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const connect = async () => {
      try {
        conn = await moduleBindings.DbConnection.builder()
          .withIdentity(localStorage.getItem("identity") || undefined)
          .withClientId("vibe-bombparty")
          .withDatabaseName("vibe-multiplayer")
          .withModule(moduleBindings.module)
          .withOnIdentityReceived((identity) => {
            localStorage.setItem("identity", identity);
          })
          .build();

        conn.onConnect(() => {
          setIsConnected(true);
          console.log("Connected to SpacetimeDB");
        });

        conn.onDisconnect(() => {
          setIsConnected(false);
          console.log("Disconnected from SpacetimeDB");
        });

        // Set up subscriptions
        const sub = conn
          .subscriptionBuilder()
          .subscribe("SELECT * FROM player")
          .onError((err) => console.error("Subscription error:", err))
          .onApplied(() => console.log("Subscription applied"))
          .build();

        // Register callbacks
        conn.db.player.onInsert((ctx, player) => {
          setPlayers((prev) => {
            const next = new Map(prev);
            next.set(player.identity.toHexString(), player);
            return next;
          });

          if (player.identity.toHexString() === conn?.identity?.toHexString()) {
            setLocalPlayer(player);
          }
        });

        conn.db.player.onDelete((ctx, player) => {
          setPlayers((prev) => {
            const next = new Map(prev);
            next.delete(player.identity.toHexString());
            return next;
          });

          if (player.identity.toHexString() === conn?.identity?.toHexString()) {
            setLocalPlayer(null);
          }
        });
      } catch (error) {
        console.error("Failed to connect:", error);
      }
    };

    connect();

    return () => {
      conn?.close();
      conn = null;
    };
  }, []);

  const handleJoinGame = async () => {
    if (!conn || !conn.identity) return;

    const username = prompt("Enter your username:");
    if (!username) return;

    try {
      await conn.reducers.registerPlayer(username);
    } catch (error) {
      console.error("Failed to join game:", error);
    }
  };

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

        {isConnected && !localPlayer && (
          <button
            onClick={handleJoinGame}
            className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded"
          >
            Join Game
          </button>
        )}

        {localPlayer && (
          <div className="mb-8">
            <h2 className="text-2xl mb-4">Your Profile</h2>
            <div className="bg-gray-800 p-4 rounded">
              <p>Username: {localPlayer.username}</p>
              <p>Score: {localPlayer.score}</p>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl mb-4">Players ({players.size})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from(players.values()).map((player) => (
              <div
                key={player.identity.toHexString()}
                className="bg-gray-800 p-4 rounded"
              >
                <p>Username: {player.username}</p>
                <p>Score: {player.score}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
