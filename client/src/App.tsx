import { useState } from 'react';

import { GameList } from './components/GameList';
import { GameState } from './components/GameState';
import { usePlayerInfoTable } from './hooks/usePlayerInfoTable';
import { useSpacetimeDB } from './hooks/useSpacetimeDB';

function App() {
  const { connectionIdentity, isConnected, conn } = useSpacetimeDB();
  const playerInfos = usePlayerInfoTable(conn, isConnected);

  // Track selected game ID, initially null (no game selected)
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);

  const handleJoinGame = async () => {
    if (!isConnected || selectedGameId === null) return;

    const username = prompt('Enter your username:');
    if (!username) return;

    try {
      await conn?.reducers.registerPlayer(selectedGameId, username);
    } catch (error) {
      // Silently handle errors
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Vibe Bombparty</h1>
          {selectedGameId !== null && (
            <button
              onClick={() => setSelectedGameId(null)}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back to game list
            </button>
          )}
        </header>

        {selectedGameId === null ? (
          <GameList conn={conn} isConnected={isConnected} onSelectGame={setSelectedGameId} />
        ) : (
          <GameState
            gameId={selectedGameId}
            conn={conn}
            isConnected={isConnected}
            playerInfos={playerInfos}
            connectionIdentity={connectionIdentity}
            onJoinGame={handleJoinGame}
          />
        )}
      </div>
    </div>
  );
}

export default App;
