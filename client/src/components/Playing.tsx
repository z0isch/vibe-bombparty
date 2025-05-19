import { useEffect, useRef, useState } from 'react';

import { DbConnection } from '../generated';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { PlayingState } from '../generated/playing_state_type';
import { CircularCountdown } from './CircularCountdown';
import { ExampleTrigrams } from './ExampleTrigrams';
import { Player } from './Player';

export interface PlayingProps {
  playingState: PlayingState;
  playerInfos: PlayerInfoTable[];
  conn: DbConnection;
  gameId: number;
}

export function Playing({ playingState, playerInfos, conn, gameId }: PlayingProps) {
  const [timeLeft, setTimeLeft] = useState(playingState.settings.turnTimeoutSeconds);
  const timerRef = useRef<number>();

  const handleUpdateWord = (word: string) => {
    conn.reducers.updateCurrentWord(gameId, word);
  };

  const handleRestartGame = () => {
    conn.reducers.restartGame(gameId);
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

  // Use the winner field from PlayingState
  const winnerId = playingState.winner;
  const winnerInfo = winnerId
    ? playerInfos.find(
      (info) => info.identity.toHexString() === winnerId.toHexString()
    )
    : null;
  const isGameOver = !!winnerId;

  // Display win condition label
  let winConditionLabel = '';
  switch (playingState.settings.winCondition.tag) {
    case 'LastPlayerStanding':
      winConditionLabel = 'Be the last player with lives!';
      break;
    case 'UseAllLetters':
      winConditionLabel = 'First to use every letter wins!';
      break;
    default:
      winConditionLabel = '';
  }

  return (
    <div className="space-y-6">
      {/* Win Condition Display */}
      <div className="text-center py-2 bg-gray-900 rounded-lg shadow mb-2">
        <span className="text-lg font-semibold text-blue-300">Win Condition:</span>{' '}
        <span className="text-lg text-white">{winConditionLabel}</span>
      </div>
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
              {/* Show trigram examples at game over */}
              {playingState.trigramExamples.length > 0 && (
                <div className="mt-4">
                  <ExampleTrigrams trigramExamples={playingState.trigramExamples} />
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
          <div className="relative h-20">
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              <CircularCountdown
                timeLeft={timeLeft}
                totalTime={playingState.settings.turnTimeoutSeconds}
              />
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="text-5xl font-bold text-yellow-400">
                {playingState.currentTrigram}
              </div>
            </div>
          </div>

          {/* Grid layout for trigrams and players */}
          <div className="grid grid-cols-5 gap-4">
            {/* Trigram Examples Section - Takes up 1/5 of the space */}
            <div className="col-span-1">
              {playingState.trigramExamples.length > 0 && (
                <div className="sticky top-4">
                  <ExampleTrigrams trigramExamples={playingState.trigramExamples} />
                </div>
              )}
            </div>

            {/* Players Section - Takes up 4/5 of the space */}
            <div className="col-span-4">
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
                      (p) => p.playerIdentity.toHexString() === conn.identity.toHexString()
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
                    const isCurrentPlayer =
                      player.playerIdentity.toHexString() === conn.identity.toHexString();

                    // Check if it's this player's turn by finding their index in the original array
                    const playerIndex = playingState.players.findIndex(
                      (p) => p.playerIdentity.toHexString() === player.playerIdentity.toHexString()
                    );
                    const isTheirTurn =
                      playerIndex === playingState.currentTurnIndex % playingState.players.length;

                    return (
                      <Player
                        key={player.playerIdentity.toHexString()}
                        gameId={gameId}
                        player={player}
                        playerInfo={playerInfo}
                        isCurrentPlayer={isCurrentPlayer}
                        isTheirTurn={isTheirTurn && !isGameOver}
                        conn={conn}
                        onUpdateWord={handleUpdateWord}
                        currentTrigram={playingState.currentTrigram}
                        winCondition={playingState.settings.winCondition}
                      />
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
