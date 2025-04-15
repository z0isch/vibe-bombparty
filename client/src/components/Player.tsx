import { useEffect, useRef, useState } from "react";
import { PlayerGameData } from "../generated/player_game_data_type";
import { PlayerInfoTable } from "../generated/player_info_table_type";
import { DbConnection } from "../generated";
import { GameStateEvent } from "../generated/game_state_event_type";

interface PlayerProps {
  player: PlayerGameData;
  playerInfo: PlayerInfoTable;
  isCurrentPlayer: boolean;
  isTheirTurn: boolean;
  onUpdateWord: (word: string) => void;
  conn: DbConnection;
  events: GameStateEvent[] | undefined;
  currentTrigram: string;
}

// Heart SVG component
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`w-6 h-6 ${
        filled ? "text-red-500" : "text-gray-700"
      } transition-colors duration-200`}
    >
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  );
}

export function Player({
  player,
  playerInfo,
  isCurrentPlayer,
  isTheirTurn,
  onUpdateWord,
  conn,
  events,
  currentTrigram,
}: PlayerProps) {
  const [inputWord, setInputWord] = useState(player.currentWord);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if current word contains the trigram
  const containsTrigram = inputWord.toUpperCase().includes(currentTrigram);

  // Update local state when server state changes
  useEffect(() => {
    // Only sync with server state if it's not the current player's turn
    if (!isCurrentPlayer || !isTheirTurn) {
      setInputWord(player.currentWord);
    }
  }, [player.currentWord, isCurrentPlayer, isTheirTurn]);

  // Focus input when it becomes player's turn
  useEffect(() => {
    if (isTheirTurn && isCurrentPlayer && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTheirTurn, isCurrentPlayer]);

  // Handle invalid guess events
  useEffect(() => {
    const invalidGuess = events?.some((e) => e.tag === "InvalidGuess");
    if (invalidGuess) {
      setIsShaking(true);
      // Reset shake animation after it completes
      const timer = setTimeout(() => setIsShaking(false), 800);
      return () => clearTimeout(timer);
    }
  }, [events]);

  const handleWordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWord = e.target.value;
    setInputWord(newWord);
    onUpdateWord(newWord);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && isTheirTurn && isCurrentPlayer) {
      await conn.reducers.submitWord(inputWord);
      setInputWord(""); // Clear the input after submission
    }
  };

  return (
    <div
      className={`bg-gray-800 p-4 rounded ${
        isTheirTurn ? "ring-2 ring-blue-400" : ""
      } ${isShaking ? "shake" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              playerInfo.isOnline ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <p className="font-medium">{playerInfo.username}</p>
        </div>
        <div className="flex items-center gap-1">
          {[...Array(3)].map((_, i) => (
            <Heart key={i} filled={i < player.lives} />
          ))}
        </div>
      </div>
      <div className="mt-2 space-y-2">
        <input
          ref={inputRef}
          type="text"
          value={isTheirTurn ? inputWord : player.currentWord}
          onChange={handleWordChange}
          onKeyDown={handleKeyDown}
          className={`w-full bg-gray-700 text-white px-3 py-2 rounded min-h-[2.5rem] focus:outline-none ${
            isTheirTurn && isCurrentPlayer
              ? containsTrigram && inputWord
                ? "ring-2 ring-green-400"
                : "focus:ring-2 focus:ring-blue-500"
              : "opacity-75 cursor-not-allowed"
          }`}
          disabled={!isTheirTurn || !isCurrentPlayer}
        />
      </div>
    </div>
  );
}
