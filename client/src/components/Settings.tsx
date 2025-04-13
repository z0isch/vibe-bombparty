import { useState } from "react";
import { DbConnection } from "../generated";

interface SettingsProps {
  turnTimeoutSeconds: number;
  conn: DbConnection;
  onJoinGame: () => void;
}

export function Settings({
  turnTimeoutSeconds,
  conn,
  onJoinGame,
}: SettingsProps) {
  const [turnTimeout, setTurnTimeout] = useState(turnTimeoutSeconds);

  const handleUpdateTurnTimeout = async () => {
    if (!conn) return;
    try {
      await conn.reducers.updateTurnTimeout(turnTimeout);
    } catch (error) {
      console.error("Failed to update turn timeout:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl mb-4">Game Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Turn Timeout (seconds)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={turnTimeout}
                onChange={(e) => setTurnTimeout(parseInt(e.target.value) || 1)}
                className="bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleUpdateTurnTimeout}
                className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <button
          onClick={onJoinGame}
          className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded text-lg font-medium"
        >
          Join Game
        </button>
        <p className="mt-2 text-sm text-gray-400">
          Joining the game will start it if you're the first player
        </p>
      </div>
    </div>
  );
}
