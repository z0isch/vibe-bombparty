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
}

export function Player({
  player,
  playerInfo,
  isCurrentPlayer,
  isTheirTurn,
  onUpdateWord,
  conn,
  events,
}: PlayerProps) {
  const [inputWord, setInputWord] = useState(player.currentWord);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        isTheirTurn ? "ring-2 ring-green-500" : ""
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
      </div>
      <p className="text-gray-300 mb-2">Score: {player.score}</p>
      <div className="mt-2">
        <input
          ref={inputRef}
          type="text"
          value={isTheirTurn ? inputWord : player.currentWord}
          onChange={handleWordChange}
          onKeyDown={handleKeyDown}
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
