import { Countdown } from './components/Countdown';
import { Playing } from './components/Playing';
import { Settings } from './components/Settings';
import { useSpacetimeDB } from './hooks/useSpacetimeDB';

function App() {
  const [
    { gameStateTable, connectionIdentity, currentPlayer, playerInfos, isConnected, conn },
    { registerPlayer },
  ] = useSpacetimeDB();

  const handleJoinGame = async () => {
    if (!isConnected) return;

    const username = prompt('Enter your username:');
    if (!username) return;

    try {
      await registerPlayer(username);
    } catch (error) {
      // Silently handle errors
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
            isCurrentPlayer={!!currentPlayer}
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
