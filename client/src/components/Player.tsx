import { motion } from 'motion/react';

import { useEffect, useRef, useState } from 'react';

import { DbConnection } from '../generated';
import { PlayerGameData } from '../generated/player_game_data_type';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import TurnLogicMode from '../generated/turn_logic_mode_type';
import { WinCondition } from '../generated/win_condition_type';
import { usePlayerEventMotionProps } from '../hooks/usePlayerEventMotionProps';

interface PlayerProps {
  player: PlayerGameData;
  playerInfo: PlayerInfoTable;
  isCurrentPlayer: boolean;
  isTheirTurn: boolean;
  onUpdateWord: (word: string) => void;
  conn: DbConnection;
  gameId: number;
  currentTrigram: string;
  winCondition: WinCondition;
  turnLogicMode: TurnLogicMode;
  isGameOver?: boolean;
  currentTurnNumber: number;
  startingHearts?: number;
  bonusLetterWordCount?: number;
}

export function Player({
  player,
  playerInfo,
  isCurrentPlayer,
  isTheirTurn,
  onUpdateWord,
  conn,
  gameId,
  currentTrigram,
  winCondition,
  turnLogicMode,
  isGameOver,
  currentTurnNumber,
  startingHearts,
  bonusLetterWordCount,
}: PlayerProps) {
  const [inputWord, setInputWord] = useState(player.currentWord);
  const inputRef = useRef<HTMLInputElement>(null);

  const cardMotionProps = usePlayerEventMotionProps(
    (events) => ({
      initial: {
        backgroundColor: '#1F2937',
      },
      animate: {
        backgroundColor:
          events.TimeUp !== null
            ? '#7F1D1D' // bg-red-900
            : events.CorrectGuess !== null
              ? '#14532D' // bg-green-900
              : '#1F2937', // bg-gray-800
        rotate: events.InvalidGuess ? [0, -1, 1, 0] : [],
      },
    }),
    player.playerIdentity
  );

  // Check if current word contains the trigram
  const containsTrigram = inputWord.toUpperCase().includes(currentTrigram);

  // Update local state when server state changes
  useEffect(() => {
    // Only sync with server state if it's not the current player's turn
    if (!isCurrentPlayer || !isTheirTurn) {
      setInputWord(player.currentWord);
    }
  }, [player.currentWord, isCurrentPlayer]);

  // Focus input when it becomes player's turn
  useEffect(() => {
    if (isTheirTurn && isCurrentPlayer && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTheirTurn, isCurrentPlayer]);

  // Clear input when a new turn starts for the current player
  useEffect(() => {
    if (isCurrentPlayer && isTheirTurn) {
      setInputWord('');
    }
  }, [currentTurnNumber, isCurrentPlayer, isTheirTurn]);

  const handleWordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWord = e.target.value;
    setInputWord(newWord);
    onUpdateWord(newWord);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isTheirTurn && isCurrentPlayer) {
      await conn.reducers.submitWord(gameId, inputWord);
      setInputWord('');
    }
  };

  let inputEnabled = true;
  switch (player.winConditionData.tag) {
    case 'LastPlayerStanding': {
      inputEnabled = player.winConditionData.value > 0;
      break;
    }
    case 'UseAllLetters': {
      break;
    }
    default: {
      const _exhaustive: never = player.winConditionData;
      throw new Error(`Unhandled winConditionData tag: ${JSON.stringify(_exhaustive)}`);
    }
  }
  switch (turnLogicMode.tag) {
    case 'Simultaneous':
      inputEnabled = inputEnabled && isCurrentPlayer && !isGameOver;
      break;
    case 'Classic':
      inputEnabled = inputEnabled && isTheirTurn && isCurrentPlayer;
      break;
    default: {
      const _exhaustive: never = turnLogicMode;
      throw new Error(`Unhandled turnLogicMode tag: ${JSON.stringify(_exhaustive)}`);
    }
  }

  // --- WORD PILLS LOGIC ---
  let wordPills: string[] = [];
  if (turnLogicMode.tag === 'Simultaneous') {
    wordPills = player.pastGuesses
      .filter((g) => g.roundNumber === currentTurnNumber)
      .map((g) => g.word);
  } else if (turnLogicMode.tag === 'Classic') {
    if (player.pastGuesses.length > 0) {
      wordPills = player.pastGuesses
        .slice(-5)
        .map((g) => g.word)
        .reverse();
    }
  }

  return (
    <motion.div
      className={`p-4 rounded ${isTheirTurn ? 'ring-2 ring-blue-400' : ''}`}
      {...cardMotionProps}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              playerInfo.isOnline ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <p className="font-medium">{playerInfo.username}</p>
        </div>
        {/* Only show hearts if winCondition is LastPlayerStanding and player.winConditionData is LastPlayerStanding */}
        {(() => {
          switch (winCondition.tag) {
            case 'LastPlayerStanding': {
              if (player.winConditionData.tag === 'LastPlayerStanding') {
                const lives = player.winConditionData.value;
                const maxHearts = typeof startingHearts === 'number' ? startingHearts : lives;
                return (
                  <div className="flex items-center gap-1">
                    {[...Array(maxHearts)].map((_, i) => (
                      <Heart
                        key={i}
                        player={player}
                        isActive={i < lives}
                        isNewestHeart={i === lives - 1}
                      />
                    ))}
                  </div>
                );
              }
              return null;
            }
            case 'UseAllLetters':
              return null;
            default: {
              // Exhaustiveness check
              const _exhaustive: never = winCondition;
              throw new Error(`Unhandled winCondition tag: ${JSON.stringify(_exhaustive)}`);
            }
          }
        })()}
      </div>
      <div className="mt-2 space-y-2">
        {/* WORD PILLS SECTION */}
        {wordPills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1">
            {wordPills.map((word, idx) => (
              <span
                key={idx}
                className="px-3 py-1 rounded-full bg-blue-900 text-blue-200 text-sm font-semibold shadow border border-blue-700"
              >
                {word}
              </span>
            ))}
          </div>
        )}
        {/* BONUS LETTER PROGRESS BAR */}
        {bonusLetterWordCount &&
          bonusLetterWordCount > 1 &&
          (() => {
            // Count words since last bonus letter (simple: total guesses modulo bonusLetterWordCount)
            const guesses = player.pastGuesses.length;
            const progress = guesses % bonusLetterWordCount;
            const percent = (progress / bonusLetterWordCount) * 100;
            return (
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-blue-200">
                    {progress} / {bonusLetterWordCount} words for bonus letter
                  </span>
                </div>
                <div className="w-full h-2 bg-blue-900 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-blue-400 transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })()}
        <input
          ref={inputRef}
          type="text"
          value={inputWord}
          onChange={handleWordChange}
          onKeyDown={handleKeyDown}
          className={`w-full bg-gray-700 text-white px-3 py-2 rounded min-h-[2.5rem] focus:outline-none ${
            inputEnabled
              ? inputWord.length > 10 && containsTrigram
                ? 'ring-2 ring-yellow-400 bg-yellow-900/20' // Gold highlight for long words with trigram
                : containsTrigram && inputWord
                  ? 'ring-2 ring-green-400'
                  : 'focus:ring-2 focus:ring-blue-500'
              : player.pastGuesses &&
                  player.pastGuesses.length > 0 &&
                  player.pastGuesses[player.pastGuesses.length - 1].word.length > 10
                ? 'ring-2 ring-yellow-400 bg-yellow-900/20 text-gray-400 cursor-not-allowed' // Gold highlight for other players' long words
                : 'text-gray-400 cursor-not-allowed'
          }`}
          disabled={!inputEnabled}
        />
        <div className="flex flex-wrap gap-1 mt-2">
          {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((letter) => {
            return (
              <Letter
                key={letter}
                player={player}
                letter={letter}
                isUsed={player.usedLetters.includes(letter)}
                isFree={player.freeLetters.includes(letter)}
              />
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function Heart({
  player,
  isActive,
  isNewestHeart,
}: {
  player: PlayerGameData;
  isActive: boolean;
  isNewestHeart: boolean;
}) {
  const motionProps = usePlayerEventMotionProps(
    (events) => ({
      initial: {
        color: isActive ? '#EF4444' : '#374151', // text-red-500 : text-gray-700,
      },
      animate: {
        color: isActive
          ? events.LifeEarned !== null && isNewestHeart
            ? '#FCD34D' // text-yellow-300
            : '#EF4444' // text-red-500
          : '#374151', // text-gray-700
        scale: events.LifeEarned !== null && isNewestHeart ? [1, 1.2, 1] : 1,
      },
    }),
    player.playerIdentity
  );
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-6 h-6"
      {...motionProps}
    >
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </motion.svg>
  );
}

function Letter({
  player,
  letter,
  isUsed,
  isFree,
}: {
  player: PlayerGameData;
  letter: string;
  isUsed: boolean;
  isFree: boolean;
}) {
  const motionProps = usePlayerEventMotionProps(
    (events) => ({
      animate:
        letter === events.FreeLetterAward?.value.letter
          ? {
              scale: [1, 2, 1],
            }
          : {},
    }),
    player.playerIdentity
  );

  return (
    <motion.span
      className={`px-1.5 py-0.5 rounded text-sm ${
        isFree
          ? 'bg-yellow-900 text-yellow-300' // Gold for free letters
          : isUsed
            ? 'bg-gray-700 text-white' // Black/white for used letters
            : 'bg-gray-700 text-gray-500' // Grey for unused letters
      }`}
      {...motionProps}
    >
      {letter}
    </motion.span>
  );
}
