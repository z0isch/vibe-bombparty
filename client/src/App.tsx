import { useEffect, useState } from "react";
import { useSpacetimeDB } from "./hooks/useSpacetimeDB";
import { Playing } from "./components/Playing";
import { Settings } from "./components/Settings";
import { GameState } from "./generated";

function App() {
  const [
    { game, connectionIdentity, currentPlayer, isConnected, conn },
    { registerPlayer },
  ] = useSpacetimeDB();

  const handleJoinGame = async () => {
    if (!isConnected) return;

    const username = prompt("Enter your username:");
    if (!username) return;

    try {
      await registerPlayer(username);
    } catch (error) {
      console.error("Failed to join game:", error);
    }
  };

  function renderGameState() {
    if (!game || !conn) return null;

    switch (game.state.tag) {
      case "Settings":
        return (
          <Settings
            turnTimeoutSeconds={5} // Default value from server/src/lib.rs
            conn={conn}
            onJoinGame={handleJoinGame}
          />
        );
      case "Playing":
        if (!connectionIdentity) return null;
        return (
          <Playing
            playingState={game.state.value}
            connectionIdentity={connectionIdentity}
            conn={conn}
          />
        );
      default:
        // This ensures we handle all possible states
        const _exhaustiveCheck: never = game.state;
        return null;
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
