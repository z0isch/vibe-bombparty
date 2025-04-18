import { motion } from 'motion/react';

import { useEffect, useRef, useState } from 'react';

import { eventQueue } from '../eventQueue';
import { DbConnection } from '../generated';
import { PlayerGameData } from '../generated/player_game_data_type';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { usePlayerEventMotionProps } from '../hooks/usePlayerEventMotionProps';

interface PlayerProps {
  player: PlayerGameData;
  playerInfo: PlayerInfoTable;
  isCurrentPlayer: boolean;
  isTheirTurn: boolean;
  onUpdateWord: (word: string) => void;
  conn: DbConnection;
  currentTrigram: string;
}

export function Player({
  player,
  playerInfo,
  isCurrentPlayer,
  isTheirTurn,
  onUpdateWord,
  conn,
  currentTrigram,
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
  }, [player.currentWord, isCurrentPlayer, isTheirTurn]);

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

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isTheirTurn && isCurrentPlayer) {
      await conn.reducers.submitWord(inputWord);
      setInputWord(''); // Clear the input after submission
    }
  };

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
        <div className="flex items-center gap-1">
          {[...Array(Math.max(3, player.lives))].map((_, i) => (
            <Heart
              key={i}
              player={player}
              isActive={i < player.lives}
              isNewestHeart={i === player.lives - 1}
            />
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
          placeholder={!isTheirTurn && player.lastValidGuess ? player.lastValidGuess : ''}
          className={`w-full bg-gray-700 text-white px-3 py-2 rounded min-h-[2.5rem] focus:outline-none ${
            isTheirTurn && isCurrentPlayer
              ? inputWord.length > 10 && containsTrigram
                ? 'ring-2 ring-yellow-400 bg-yellow-900/20' // Gold highlight for long words with trigram
                : containsTrigram && inputWord
                  ? 'ring-2 ring-green-400'
                  : 'focus:ring-2 focus:ring-blue-500'
              : 'opacity-75 cursor-not-allowed'
          }`}
          disabled={!isTheirTurn || !isCurrentPlayer}
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
