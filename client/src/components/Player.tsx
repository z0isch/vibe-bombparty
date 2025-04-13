import { useEffect, useRef, useState } from "react";
import { PlayerData } from "../generated/player_data_type";

interface PlayerProps {
  player: PlayerData;
  isCurrentPlayer: boolean;
  isTheirTurn: boolean;
  onEndTurn: () => void;
  onUpdateWord: (word: string) => void;
}

export function Player({
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
