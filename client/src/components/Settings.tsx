import { useEffect, useState } from 'react';

import { DbConnection } from '../generated';
import { PlayerGameData } from '../generated/player_game_data_type';
import { PlayerInfoTable } from '../generated/player_info_table_type';

interface SettingsProps {
  gameId: number;
  turnTimeoutSeconds: number;
  players: PlayerGameData[];
  playerInfos: PlayerInfoTable[];
  conn: DbConnection;
  onJoinGame: () => void;
  isCurrentPlayer: boolean;
}

export function Settings({
  gameId,
  turnTimeoutSeconds,
  players,
  playerInfos,
  conn,
  onJoinGame,
  isCurrentPlayer,
}: SettingsProps) {
  const [turnTimeout, setTurnTimeout] = useState(turnTimeoutSeconds);

  // Keep local state in sync with prop
  useEffect(() => {
    setTurnTimeout(turnTimeoutSeconds);
  }, [turnTimeoutSeconds]);
  const handleStartGame = async () => {
    if (!conn) return;
    try {
      await conn.reducers.startGame(gameId);
    } catch (error) {
      // Silently handle errors
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
            <input
              type="number"
              min="1"
              value={turnTimeout}
              onChange={(e) => {
                const newTimeout = parseInt(e.target.value) || 1;
                setTurnTimeout(newTimeout);
                conn?.reducers.updateTurnTimeout(gameId, newTimeout);
              }}
              className="bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl mb-4">Players ({players.length})</h2>
        <div className="space-y-2">
          {players.map((player) => {
            const playerInfo = playerInfos.find(
              (info) => info.identity.toHexString() === player.playerIdentity.toHexString()
            );
            if (!playerInfo) return null;

            return (
              <div
                key={player.playerIdentity.toHexString()}
                className="bg-gray-800 p-4 rounded flex items-center gap-2"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    playerInfo.isOnline ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="flex-grow">{playerInfo.username}</span>
                <button
                  onClick={async () => {
                    try {
                      await conn.reducers.removePlayer(gameId, player.playerIdentity);
                    } catch (error) {
                      // Silently handle errors
                    }
                  }}
                  className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm"
                >
                  Remove
                </button>
              </div>
            );
          })}
          {!isCurrentPlayer && (
            <button
              onClick={onJoinGame}
              className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded text-lg font-medium w-full"
            >
              Join Game
            </button>
          )}
        </div>
      </div>

      {isCurrentPlayer && players.length > 0 && (
        <div>
          <button
            onClick={handleStartGame}
            disabled={players.length < 2}
            className={`px-6 py-3 rounded text-lg font-medium w-full ${
              players.length < 2
                ? 'bg-gray-500 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            Start Game
          </button>
          <p className="mt-2 text-sm text-gray-400">
            {players.length < 2 ? (
              'Need at least 2 players to start the game'
            ) : (
              <>
                Start the game with {players.length} player
                {players.length !== 1 && 's'}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
