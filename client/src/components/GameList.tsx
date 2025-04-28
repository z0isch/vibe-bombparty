import { useEffect, useRef, useState } from 'react';

import { DbConnection, EventContext } from '../generated';
import { Game } from '../generated/game_type';
import { useGameTable } from '../hooks/useGameTable';

interface GameListProps {
  conn: DbConnection;
  onSelectGame: (game: Game) => void;
}

export function GameList({ conn, onSelectGame }: GameListProps) {
  const games = useGameTable(conn);
  const [newGameName, setNewGameName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when isCreating becomes true
  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
    }
  }, [isCreating]);

  // Watch for new games being created
  useEffect(() => {
    const onInsert = (_ctx: EventContext, game: Game) => {
      // If we just created this game (we're in the player_identities list)
      if (game.playerIdentities.some((id) => id.toHexString() === conn.identity?.toHexString())) {
        onSelectGame(game);
      }
    };

    conn.db.game.onInsert(onInsert);
    return () => {
      conn.db.game.removeOnInsert(onInsert);
    };
  }, [conn, onSelectGame]);

  const handleCreateGame = async () => {
    if (!newGameName.trim()) return;

    try {
      await conn.reducers.createGame(newGameName.trim());
      setNewGameName('');
      setIsCreating(false);
      // Don't navigate here - we'll do it in the onInsert callback
    } catch (error) {
      console.error('Failed to create game:', error);
    }
  };

  const handleDeleteGame = async (gameId: number) => {
    try {
      await conn.reducers.deleteGame(gameId);
    } catch (error) {
      console.error('Failed to delete game:', error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Available Games</h2>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            {isCreating ? 'Cancel' : 'Create Game'}
          </button>
        </div>

        {isCreating && (
          <div className="mb-4 p-4 bg-gray-700 rounded">
            <h3 className="text-lg font-medium mb-2">Create New Game</h3>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newGameName}
                onChange={(e) => setNewGameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newGameName.trim()) {
                    handleCreateGame();
                  }
                }}
                placeholder="Enter game name"
                className="flex-1 bg-gray-600 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCreateGame}
                disabled={!newGameName.trim()}
                className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {games.map((game) => {
            const isInGame =
              conn.identity &&
              game.playerIdentities.some((id) => id.toHexString() === conn.identity.toHexString());

            return (
              <div
                key={game.id}
                className={`flex items-center gap-2 ${
                  isInGame ? 'bg-blue-900' : 'bg-gray-700'
                } rounded transition-colors`}
              >
                <button onClick={() => onSelectGame(game)} className="flex-1 text-left px-4 py-2">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{game.name}</div>
                    <div className="text-sm text-gray-400">
                      {game.playerIdentities.length}{' '}
                      {game.playerIdentities.length === 1 ? 'player' : 'players'}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteGame(game.id)}
                  className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            );
          })}
          {games.length === 0 && (
            <div className="text-gray-400 text-center py-4">No games available</div>
          )}
        </div>
      </div>
    </div>
  );
}
