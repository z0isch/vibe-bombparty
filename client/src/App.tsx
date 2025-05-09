import { useState } from 'react';

import { GameList } from './components/GameList';
import { GameState } from './components/GameState';
import { PlayerNameDialog } from './components/PlayerNameDialog';
import { Game } from './generated';
import { usePlayerInfoTable } from './hooks/usePlayerInfoTable';
import { useSpacetimeDB } from './hooks/useSpacetimeDB';

function App() {
  const conn = useSpacetimeDB();
  const { playerInfos, showNameDialog, setShowNameDialog } = usePlayerInfoTable(conn);
  // Track selected game ID, initially null (no game selected)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  if (!conn) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-2xl">Connecting to SpacetimeDB...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {showNameDialog && <PlayerNameDialog conn={conn} onClose={() => setShowNameDialog(false)} />}
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
          <GameState game={selectedGame} conn={conn} playerInfos={playerInfos} />
        )}
      </div>
    </div>
  );
}

export default App;
