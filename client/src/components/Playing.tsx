import { PlayingState } from "../generated/playing_state_type";
import { PlayerInfoTable } from "../generated/player_info_table_type";
import { Player } from "./Player";
import { DbConnection } from "../generated";

interface PlayingProps {
  playingState: PlayingState;
  playerInfos: PlayerInfoTable[];
  connectionIdentity: string;
  conn: DbConnection;
}

export function Playing({
  playingState,
  playerInfos,
  connectionIdentity,
  conn,
}: PlayingProps) {
  const handleUpdateWord = async (word: string) => {
    if (!conn) return;
    try {
      await conn.reducers.updateCurrentWord(word);
    } catch (error) {
      // Silently handle errors
    }
  };

  const handleRestart = async () => {
    if (!conn) return;
    try {
      await conn.reducers.restartGame();
    } catch (error) {
      // Silently handle errors
    }
  };

  // Check if game is over (only one player has lives)
  const isGameOver =
    playingState.players.filter((p) => p.lives > 0).length <= 1;

  // Find the winner if game is over
  const winner = isGameOver
    ? playingState.players.find((p) => p.lives > 0)
    : null;

  // Get winner's info
  const winnerInfo = winner
    ? playerInfos.find(
        (info) =>
          info.identity.toHexString() === winner.playerIdentity.toHexString()
      )
    : null;

  return (
    <div>
      {isGameOver ? (
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-4 text-yellow-400">
            Game Over!
          </h2>
          {winnerInfo && (
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg inline-block">
              <div className="text-2xl mb-2">Winner:</div>
              <div className="text-3xl font-bold text-green-400">
                {winnerInfo.username}
              </div>
              <div className="mt-4 text-gray-400">
                Survived {playingState.turnNumber} turns!
              </div>
              <button
                onClick={handleRestart}
                className="mt-6 bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded text-lg font-medium w-full"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xl text-gray-300 mb-4">
          Turn #{playingState.turnNumber}
        </div>
      )}

      <h2 className="text-2xl mb-4">Players ({playingState.players.length})</h2>
      <div className="flex flex-col gap-2">
        {[...playingState.players]
          .sort((a, b) => {
            // Find indices in original array
            const indexA = playingState.players.findIndex(
              (p) =>
                p.playerIdentity.toHexString() ===
                a.playerIdentity.toHexString()
            );
            const indexB = playingState.players.findIndex(
              (p) =>
                p.playerIdentity.toHexString() ===
                b.playerIdentity.toHexString()
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
              (info) =>
                info.identity.toHexString() ===
                player.playerIdentity.toHexString()
            );
            if (!playerInfo) return null;

            // Check if this is the current player (you)
            const isCurrentPlayer =
              player.playerIdentity.toHexString() === connectionIdentity;

            // Check if it's this player's turn by finding their index in the original array
            const playerIndex = playingState.players.findIndex(
              (p) =>
                p.playerIdentity.toHexString() ===
                player.playerIdentity.toHexString()
            );
            const isTheirTurn =
              playerIndex ===
              playingState.currentTurnIndex % playingState.players.length;

            return (
              <Player
                key={player.playerIdentity.toHexString()}
                player={player}
                playerInfo={playerInfo}
                isCurrentPlayer={isCurrentPlayer}
                isTheirTurn={isTheirTurn && !isGameOver}
                onUpdateWord={handleUpdateWord}
                conn={conn}
                events={
                  playingState.playerEvents.find(
                    (pe) =>
                      pe.playerIdentity.toHexString() ===
                      player.playerIdentity.toHexString()
                  )?.events
                }
              />
            );
          })}
      </div>
    </div>
  );
}
