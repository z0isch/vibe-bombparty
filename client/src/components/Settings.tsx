import { useEffect, useState } from 'react';

import { DbConnection } from '../generated';
import { PlayerGameData } from '../generated/player_game_data_type';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { PlayerWins } from '../generated/player_wins_type';
import TurnLogicMode from '../generated/turn_logic_mode_type';
import { WinCondition } from '../generated/win_condition_type';

interface SettingsProps {
  gameId: number;
  turnTimeoutSeconds: number;
  players: PlayerGameData[];
  playerInfos: PlayerInfoTable[];
  playerWins: PlayerWins[];
  conn: DbConnection;
  isCurrentPlayer: boolean;
  winCondition: WinCondition;
  turnLogicMode: TurnLogicMode;
}

export function Settings({
  gameId,
  turnTimeoutSeconds,
  players,
  playerInfos,
  playerWins,
  conn,
  isCurrentPlayer,
  winCondition,
  turnLogicMode,
}: SettingsProps) {
  const [turnTimeout, setTurnTimeout] = useState(turnTimeoutSeconds);
  const [selectedWinCondition, setSelectedWinCondition] = useState<WinCondition>(winCondition);
  const [selectedTurnLogicMode, setSelectedTurnLogicMode] = useState<TurnLogicMode>(turnLogicMode);
  // Keep local state in sync with prop
  useEffect(() => {
    setTurnTimeout(turnTimeoutSeconds);
  }, [turnTimeoutSeconds]);
  useEffect(() => {
    setSelectedWinCondition(winCondition);
  }, [winCondition]);
  useEffect(() => {
    setSelectedTurnLogicMode(turnLogicMode);
  }, [turnLogicMode]);
  const handleStartGame = async () => {
    if (!conn) return;
    try {
      await conn.reducers.startGame(gameId);
    } catch (error) {
      // Silently handle errors
    }
  };

  function getTurnLogicModeByTag(
    tag: string
  ): typeof TurnLogicMode.Classic | typeof TurnLogicMode.Simultaneous {
    if (tag === TurnLogicMode.Classic.tag) return TurnLogicMode.Classic;
    return TurnLogicMode.Simultaneous;
  }

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
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Win Condition</label>
            <select
              value={selectedWinCondition.tag}
              onChange={async (e) => {
                const tag = e.target.value;
                let winCond: WinCondition =
                  tag === WinCondition.LastPlayerStanding.tag
                    ? (WinCondition.LastPlayerStanding as any as WinCondition)
                    : (WinCondition.UseAllLetters as any as WinCondition);
                setSelectedWinCondition(winCond);
                try {
                  await conn.reducers.updateWinCondition(gameId, winCond);
                } catch (error) {
                  // Silently handle errors
                }
              }}
              className="bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            >
              <option value={WinCondition.LastPlayerStanding.tag as string}>
                Last Player Standing (default)
              </option>
              <option value={WinCondition.UseAllLetters.tag as string}>Use All Letters</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Turn Logic Mode</label>
            <select
              value={selectedTurnLogicMode.tag}
              onChange={async (e) => {
                const tag = e.target.value;
                const mode = getTurnLogicModeByTag(tag) as TurnLogicMode;
                setSelectedTurnLogicMode(mode);
                try {
                  await conn.reducers.updateTurnLogicMode(gameId, mode);
                } catch (error) {
                  // Silently handle errors
                }
              }}
              className="bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            >
              <option value={TurnLogicMode.Classic.tag}>Classic (turn-based)</option>
              <option value={TurnLogicMode.Simultaneous.tag}>
                Simultaneous (all play at once)
              </option>
            </select>
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
            const playerWinCount =
              playerWins.find(
                (w) => w.playerIdentity.toHexString() === player.playerIdentity.toHexString()
              )?.wins || 0;
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
                <span className="text-yellow-400 font-medium mr-4">
                  {playerWinCount} {playerWinCount === 1 ? 'win' : 'wins'}
                </span>
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
              onClick={() => conn.reducers.addPlayerToGame(gameId)}
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
