import { useEffect, useRef, useState } from 'react';

import { DbConnection } from '../generated';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { PlayingState } from '../generated/playing_state_type';
import { CircularCountdown } from './CircularCountdown';
import { FailedTrigram } from './FailedTrigram';
import { Player } from './Player';

interface PlayingProps {
  playingState: PlayingState;
  playerInfos: PlayerInfoTable[];
  connectionIdentity: string;
  conn: DbConnection;
}

export function Playing({ playingState, playerInfos, connectionIdentity, conn }: PlayingProps) {
  const [timeLeft, setTimeLeft] = useState(playingState.settings.turnTimeoutSeconds);
  const timerRef = useRef<number>();

  const handleUpdateWord = async (word: string) => {
    if (!conn) return;
    try {
      await conn.reducers.updateCurrentWord(word);
    } catch (error) {
      // Silently handle errors
    }
  };

  const handleRestartGame = async () => {
    try {
      await conn.reducers.restartGame();
    } catch (error) {
      // Silently handle errors
    }
  };

  // Start/reset timer when turn changes
  useEffect(() => {
    // Reset timer
    setTimeLeft(playingState.settings.turnTimeoutSeconds);

    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Start new timer
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 900);

    // Cleanup timer on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [playingState.turnNumber, playingState.settings.turnTimeoutSeconds]);

  const isGameOver = playingState.players.filter((p) => p.lives > 0).length <= 1;

  // Find the winner if game is over
  const winner = isGameOver ? playingState.players.find((p) => p.lives > 0) : null;

  // Get winner's info
  const winnerInfo = winner
    ? playerInfos.find(
        (info) => info.identity.toHexString() === winner.playerIdentity.toHexString()
      )
    : null;

  return (
    <div className="space-y-6">
      {!isGameOver && (
        <div className="flex justify-end">
          <button
            onClick={handleRestartGame}
            className="bg-yellow-500 hover:bg-yellow-600 px-4 py-2 rounded text-sm font-medium"
          >
            Restart Game
          </button>
        </div>
      )}
      {isGameOver ? (
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-4 text-yellow-400">Game Over!</h2>
          {winnerInfo && (
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg inline-block">
              <div className="text-2xl mb-2">Winner:</div>
              <div className="text-3xl font-bold text-green-400">{winnerInfo.username}</div>
              <div className="mt-4 text-gray-400">Survived {playingState.turnNumber} turns!</div>
              {/* Show failed trigram examples at game over */}
              {playingState.failedTrigramExamples.length > 0 && (
                <div className="mt-4">
                  <FailedTrigram
                    trigram={playingState.currentTrigram}
                    examples={playingState.failedTrigramExamples}
                  />
                </div>
              )}
              <button
                onClick={handleRestartGame}
                className="mt-6 bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded text-lg font-medium w-full"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative flex items-center h-20">
            <div className="w-20">
              <CircularCountdown
                timeLeft={timeLeft}
                totalTime={playingState.settings.turnTimeoutSeconds}
              />
            </div>
            <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
              <div className="text-5xl font-bold text-yellow-400">
                {playingState.currentTrigram}
              </div>
            </div>
            <div className="w-20" /> {/* Matching space on the right */}
          </div>

          {/* Failed Trigram Examples Section */}
          {playingState.failedTrigramExamples.length > 0 && (
            <div className="mb-4">
              <FailedTrigram
                trigram={playingState.usedTrigrams[playingState.usedTrigrams.length - 2]}
                examples={playingState.failedTrigramExamples}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {[...playingState.players]
          .sort((a, b) => {
            // Find indices in original array
            const indexA = playingState.players.findIndex(
              (p) => p.playerIdentity.toHexString() === a.playerIdentity.toHexString()
            );
            const indexB = playingState.players.findIndex(
              (p) => p.playerIdentity.toHexString() === b.playerIdentity.toHexString()
            );

            // Find current player's index
            const currentPlayerIndex = playingState.players.findIndex(
              (p) => p.playerIdentity.toHexString() === connectionIdentity
            );

            // Calculate positions relative to current player (not current turn)
            const relativeA =
              (indexA - currentPlayerIndex + playingState.players.length) %
              playingState.players.length;
            const relativeB =
              (indexB - currentPlayerIndex + playingState.players.length) %
              playingState.players.length;

            // Sort by relative position to current player
            return relativeA - relativeB;
          })
          .map((player) => {
            // Find the corresponding player info
            const playerInfo = playerInfos.find(
              (info) => info.identity.toHexString() === player.playerIdentity.toHexString()
            );
            if (!playerInfo) return null;

            // Check if this is the current player (you)
            const isCurrentPlayer = player.playerIdentity.toHexString() === connectionIdentity;

            // Check if it's this player's turn by finding their index in the original array
            const playerIndex = playingState.players.findIndex(
              (p) => p.playerIdentity.toHexString() === player.playerIdentity.toHexString()
            );
            const isTheirTurn =
              playerIndex === playingState.currentTurnIndex % playingState.players.length;

            return (
              <Player
                key={player.playerIdentity.toHexString()}
                player={player}
                playerInfo={playerInfo}
                isCurrentPlayer={isCurrentPlayer}
                isTheirTurn={isTheirTurn && !isGameOver}
                onUpdateWord={handleUpdateWord}
                conn={conn}
                currentTrigram={playingState.currentTrigram}
              />
            );
          })}
      </div>
    </div>
  );
}
