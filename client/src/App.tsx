import { Countdown } from './components/Countdown';
import { Playing } from './components/Playing';
import { Settings } from './components/Settings';
import { useGameStateTable } from './hooks/useGameStateTable';
import { useSpacetimeDB } from './hooks/useSpacetimeDB';

function App() {
  const { connectionIdentity, playerInfos, isConnected, conn } = useSpacetimeDB();

  // For now, we'll hardcode game ID to 1 since that's what the server uses
  const gameId = 1;
  const gameStateTable = useGameStateTable(conn, gameId, isConnected);

  const handleJoinGame = async () => {
    if (!isConnected) return;

    const username = prompt('Enter your username:');
    if (!username) return;

    try {
      await conn?.reducers.registerPlayer(gameId, username);
    } catch (error) {
      // Silently handle errors
    }
  };

  // Helper function to get current player from game state
  const getCurrentPlayer = () => {
    if (!connectionIdentity || !gameStateTable?.state) return null;
    switch (gameStateTable.state.tag) {
      case 'Countdown':
        return (
          gameStateTable.state.value.settings.players.find(
            (p) => p.playerIdentity.toHexString() === connectionIdentity
          ) || null
        );
      case 'Playing':
        return (
          gameStateTable.state.value.players.find(
            (p) => p.playerIdentity.toHexString() === connectionIdentity
          ) || null
        );
      case 'Settings':
        return (
          gameStateTable.state.value.players.find(
            (p) => p.playerIdentity.toHexString() === connectionIdentity
          ) || null
        );
      default:
        return null;
    }
  };

  function renderGameState() {
    if (!gameStateTable?.state || !conn) return null;

    switch (gameStateTable.state.tag) {
      case 'Settings':
        return (
          <Settings
            gameId={gameStateTable.gameId}
            turnTimeoutSeconds={gameStateTable.state.value.turnTimeoutSeconds}
            players={gameStateTable.state.value.players}
            playerInfos={playerInfos}
            conn={conn}
            onJoinGame={handleJoinGame}
            isCurrentPlayer={!!getCurrentPlayer()}
          />
        );
      case 'Countdown':
        return <Countdown countdownState={gameStateTable.state.value} playerInfos={playerInfos} />;
      case 'Playing':
        if (!connectionIdentity) return null;
        return (
          <Playing
            gameId={gameStateTable.gameId}
            playingState={gameStateTable.state.value}
            playerInfos={playerInfos}
            connectionIdentity={connectionIdentity}
            conn={conn}
          />
        );
      default: {
        // This ensures we handle all possible states
        const _exhaustiveCheck: never = gameStateTable.state;
        return null;
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Vibe Bombparty</h1>
        </header>

        {renderGameState()}
      </div>
    </div>
  );
}

export default App;
