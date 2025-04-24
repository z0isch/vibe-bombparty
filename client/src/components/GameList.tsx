import { DbConnection } from '../generated';
import { Game } from '../generated/game_type';
import { useGameTable } from '../hooks/useGameTable';

interface GameListProps {
  conn: DbConnection | null;
  isConnected: boolean;
  onSelectGame: (gameId: number) => void;
}

export function GameList({ conn, isConnected, onSelectGame }: GameListProps) {
  const games = useGameTable(conn, isConnected);

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-8">
      <h2 className="text-xl font-semibold mb-4">Available Games</h2>
      <div className="space-y-2">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => onSelectGame(game.id)}
            className="w-full text-left px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            <div className="font-medium">{game.name}</div>
          </button>
        ))}
        {games.length === 0 && (
          <div className="text-gray-400 text-center py-4">No games available</div>
        )}
      </div>
    </div>
  );
}
