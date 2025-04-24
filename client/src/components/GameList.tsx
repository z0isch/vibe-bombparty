import { DbConnection } from '../generated';
import { useGameTable } from '../hooks/useGameTable';

interface GameListProps {
  conn: DbConnection | null;
  onSelectGame: (gameId: number) => void;
}

export function GameList({ conn, onSelectGame }: GameListProps) {
  const games = useGameTable(conn);

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-8">
      <h2 className="text-xl font-semibold mb-4">Available Games</h2>
      <div className="space-y-2">
        {games.map((game) => {
          const isInGame =
            conn?.identity &&
            game.playerIdentities.some((id) => id.toHexString() === conn.identity.toHexString());

          return (
            <button
              key={game.id}
              onClick={() => onSelectGame(game.id)}
              className={`w-full text-left px-4 py-2 rounded transition-colors ${
                isInGame ? 'bg-blue-900 hover:bg-blue-800' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="font-medium">{game.name}</div>
                <div className="text-sm text-gray-400">
                  {game.playerIdentities.length}{' '}
                  {game.playerIdentities.length === 1 ? 'player' : 'players'}
                </div>
              </div>
            </button>
          );
        })}
        {games.length === 0 && (
          <div className="text-gray-400 text-center py-4">No games available</div>
        )}
      </div>
    </div>
  );
}
