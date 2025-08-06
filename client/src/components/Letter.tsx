import { motion } from 'motion/react';

import { PlayerGameData } from '../generated/player_game_data_type';
import { usePlayerEventMotionProps } from '../hooks/usePlayerEventMotionProps';

interface LetterProps {
  player: PlayerGameData;
  letter: string;
  isUsed: boolean;
  isFree: boolean;
}

export function Letter({ player, letter, isUsed, isFree }: LetterProps) {
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
