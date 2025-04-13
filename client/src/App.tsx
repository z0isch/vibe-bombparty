import { useEffect, useState, useRef } from "react";
import { PlayerData } from "./generated/player_data_type";
import { useSpacetimeDB } from "./hooks/useSpacetimeDB";

interface PlayerProps {
  player: PlayerData;
  isCurrentPlayer: boolean;
  isTheirTurn: boolean;
  onEndTurn: () => void;
  onUpdateWord: (word: string) => void;
}

function Player({
  player,
  isCurrentPlayer,
  isTheirTurn,
  onEndTurn,
  onUpdateWord,
}: PlayerProps) {
  const [inputWord, setInputWord] = useState(player.currentWord);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update local state when server state changes
  useEffect(() => {
    setInputWord(player.currentWord);
  }, [player.currentWord]);

  // Focus input when it becomes player's turn
  useEffect(() => {
    if (isTheirTurn && isCurrentPlayer && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTheirTurn, isCurrentPlayer]);

  const handleWordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWord = e.target.value;
    setInputWord(newWord);
    onUpdateWord(newWord);
  };

  return (
    <div
      className={`bg-gray-800 p-4 rounded ${
        isTheirTurn ? "ring-2 ring-green-500" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              player.isOnline ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <p className="font-medium">{player.username}</p>
        </div>
        {isTheirTurn && isCurrentPlayer && (
          <button
            onClick={onEndTurn}
            className="bg-green-500 hover:bg-green-600 px-4 py-1 rounded text-sm"
          >
            End Turn
          </button>
        )}
      </div>
      <p className="text-gray-300 mb-2">Score: {player.score}</p>
      <div className="mt-2">
        <input
          ref={inputRef}
          type="text"
          value={isTheirTurn ? inputWord : player.currentWord}
          onChange={handleWordChange}
          className={`w-full bg-gray-700 text-white px-3 py-2 rounded min-h-[2.5rem] focus:outline-none ${
            isTheirTurn && isCurrentPlayer
              ? "focus:ring-2 focus:ring-blue-500"
              : "opacity-75 cursor-not-allowed"
          }`}
          disabled={!isTheirTurn || !isCurrentPlayer}
        />
      </div>
    </div>
  );
}

function App() {
  const [
    { game, connectionIdentity, currentPlayer, isConnected, conn },
    { registerPlayer },
  ] = useSpacetimeDB();

  // Log game state on every render
  console.log(
    "Game State:",
    game && {
      currentTurnIndex: game.currentTurnIndex,
      players: game.players.map((p) => ({
        username: p.username,
        isOnline: p.isOnline,
        score: p.score,
        identity: p.identity.toHexString(),
        currentWord: p.currentWord,
      })),
    }
  );

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

  const handleEndTurn = async () => {
    if (!conn) return;
    try {
      await conn.reducers.endTurn();
    } catch (error) {
      console.error("Failed to end turn:", error);
    }
  };

  const handleUpdateWord = async (word: string) => {
    if (!conn) return;
    try {
      await conn.reducers.updateCurrentWord(word);
    } catch (error) {
      console.error("Failed to update word:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Vibe Bombparty</h1>
          {game && game.players.length > 0 && (
            <div className="text-xl text-gray-300 mb-4">
              Turn #{game.turnNumber}
            </div>
          )}
        </header>

        {connectionIdentity && !currentPlayer && (
          <button
            onClick={handleJoinGame}
            className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded"
          >
            Join Game
          </button>
        )}

        <div>
          <h2 className="text-2xl mb-4">
            Players ({game?.players.length ?? 0})
          </h2>
          <div className="flex flex-col gap-2">
            {[...(game?.players ?? [])]
              .sort((a, b) => {
                // Find indices in original array
                const indexA = game.players.findIndex(
                  (p) => p.identity.toHexString() === a.identity.toHexString()
                );
                const indexB = game.players.findIndex(
                  (p) => p.identity.toHexString() === b.identity.toHexString()
                );

                // Find current player's index
                const currentPlayerIndex = game.players.findIndex(
                  (p) => p.identity.toHexString() === connectionIdentity
                );

                // Calculate positions relative to current player (not current turn)
                const relativeA =
                  (indexA - currentPlayerIndex + game.players.length) %
                  game.players.length;
                const relativeB =
                  (indexB - currentPlayerIndex + game.players.length) %
                  game.players.length;

                // Sort by relative position to current player
                return relativeA - relativeB;
              })
              .map((player) => {
                // Check if this is the current player (you)
                const isCurrentPlayer =
                  player.identity.toHexString() === connectionIdentity;

                // Check if it's this player's turn by finding their index in the original array
                const playerIndex = game.players.findIndex(
                  (p) =>
                    p.identity.toHexString() === player.identity.toHexString()
                );
                const isTheirTurn =
                  playerIndex === game.currentTurnIndex % game.players.length;

                return (
                  <Player
                    key={player.identity.toHexString()}
                    player={player}
                    isCurrentPlayer={isCurrentPlayer}
                    isTheirTurn={isTheirTurn}
                    onEndTurn={handleEndTurn}
                    onUpdateWord={handleUpdateWord}
                  />
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
