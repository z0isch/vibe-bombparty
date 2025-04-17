import { Identity } from '@clockworklabs/spacetimedb-sdk';
import { motion } from 'motion/react';

import { useEffect, useRef, useState } from 'react';

import { DbConnection, GameStateEvent } from '../generated';
import { PlayerGameData } from '../generated/player_game_data_type';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { usePlayerEvents } from '../hooks/usePlayerEvents';

interface PlayerProps {
  player: PlayerGameData;
  playerInfo: PlayerInfoTable;
  isCurrentPlayer: boolean;
  isTheirTurn: boolean;
  onUpdateWord: (word: string) => void;
  conn: DbConnection;
  currentTrigram: string;
}

function useEventMotionProps<Tag extends GameStateEvent['tag']>(
  playerIdentity: Identity,
  tag: Tag,
  animationProps: (event: Extract<GameStateEvent, { tag: Tag }> | null) => Record<string, any>
) {
  const [event, setEvent] = useState<Extract<GameStateEvent, { tag: Tag }> | null>(null);
  usePlayerEvents(playerIdentity, (e) => {
    if (e.tag === tag) {
      setEvent(e as Extract<GameStateEvent, { tag: Tag }>);
    }
  });
  return {
    ...animationProps(event),
    onAnimationComplete: () => {
      setEvent(null);
    },
  };
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
  const [isShaking, setIsShaking] = useState(false);
  const [showNewLife, setShowNewLife] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState(false);
  const [showFreeLetterAward, setShowFreeLetterAward] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const freeLetterAwardMotionProps = useEventMotionProps(
    player.playerIdentity,
    'FreeLetterAward',
    (event) => ({
      animate:
        showFreeLetterAward === event?.value.letter
          ? {
              scale: [1, 2, 1],
            }
          : {},
      transition: {
        duration: 0.5,
      },
    })
  );

  usePlayerEvents(player.playerIdentity, (event) => {
    switch (event.tag) {
      case 'InvalidGuess':
        setIsShaking(true);
        break;
      case 'TimeUp':
        setIsTimeUp(true);
        break;
      case 'CorrectGuess':
        setIsCorrectGuess(true);
        break;
      case 'LifeEarned':
        setShowNewLife(true);
        break;
      case 'FreeLetterAward':
        setShowFreeLetterAward(event.value.letter);
        break;
      case 'MyTurn':
        break;
      case 'IWin':
        break;
      case 'ILose':
        break;
      default: {
        const exhaustiveCheck: never = event;
        return exhaustiveCheck;
      }
    }
  });

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
      initial={{
        backgroundColor: '#1F2937',
      }}
      animate={{
        rotate: isShaking ? [0, -1, 1, 0] : [0, 0, 0, 0],
        backgroundColor: isTimeUp
          ? '#7F1D1D' // bg-red-900
          : isCorrectGuess
            ? '#14532D' // bg-green-900
            : '#1F2937', // bg-gray-800
      }}
      transition={{
        rotate: { duration: 0.5 },
        backgroundColor: { duration: 0.5 },
      }}
      onAnimationComplete={() => {
        setIsShaking(false);
        setIsTimeUp(false);
        setIsCorrectGuess(false);
      }}
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
            <motion.svg
              key={i}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`w-6 h-6`}
              initial={{
                color: i < player.lives ? '#EF4444' : '#374151', // text-red-500 : text-gray-700
              }}
              animate={{
                color:
                  i < player.lives
                    ? showNewLife && i === player.lives - 1
                      ? '#FCD34D' // text-yellow-300
                      : '#EF4444' // text-red-500
                    : '#374151', // text-gray-700
                scale: showNewLife && i === player.lives - 1 ? [1, 1.2, 1] : 1,
              }}
              transition={{
                duration: 0.5,
              }}
              onAnimationComplete={() => setShowNewLife(false)}
            >
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
            </motion.svg>
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
            const isUsed = player.usedLetters.includes(letter);
            const isFree = player.freeLetters.includes(letter);
            const isNewlyAwarded = showFreeLetterAward === letter;
            return (
              <motion.span
                key={letter}
                className={`px-1.5 py-0.5 rounded text-sm ${
                  isFree
                    ? 'bg-yellow-900 text-yellow-300' // Gold for free letters
                    : isUsed
                      ? 'bg-gray-700 text-white' // Black/white for used letters
                      : 'bg-gray-700 text-gray-500' // Grey for unused letters
                }`}
                {...freeLetterAwardMotionProps}
              >
                {letter}
              </motion.span>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
