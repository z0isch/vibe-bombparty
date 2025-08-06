import { PlayerGameData } from '../generated/player_game_data_type';
import { Letter } from './Letter';

interface AlphabetDisplayProps {
  player: PlayerGameData;
}

export function AlphabetDisplay({ player }: AlphabetDisplayProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((letter) => {
        const isUsed = player.usedLetters.includes(letter);
        const isFree = player.freeLetters.includes(letter);
        return (
          <Letter key={letter} player={player} letter={letter} isUsed={isUsed} isFree={isFree} />
        );
      })}
    </div>
  );
}
