import { useState } from 'react';

import { GameList } from './components/GameList';
import { GameState } from './components/GameState';
import { Game } from './generated';
import { usePlayerInfoTable } from './hooks/usePlayerInfoTable';
import { useSpacetimeDB } from './hooks/useSpacetimeDB';

function App() {
  const conn = useSpacetimeDB();
  const playerInfos = usePlayerInfoTable(conn);

  // Track selected game ID, initially null (no game selected)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const handleJoinGame = async () => {
    if (!conn || selectedGame === null) return;

    try {
      // Add player to the game (registration is handled in useSpacetimeDB)
      await conn.reducers.addPlayerToGame(selectedGame.id);
    } catch (error) {
      // Silently handle errors
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Vibe Bombparty</h1>
          {selectedGame !== null && (
            <button
              onClick={() => setSelectedGame(null)}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back to game list
            </button>
          )}
        </header>

        {selectedGame === null ? (
          <GameList conn={conn} onSelectGame={setSelectedGame} />
        ) : (
          <GameState
            game={selectedGame}
            conn={conn}
            playerInfos={playerInfos}
            onJoinGame={handleJoinGame}
          />
        )}
      </div>
    </div>
  );
}

export default App;
