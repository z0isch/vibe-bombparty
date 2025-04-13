import { PlayingState } from "../generated/playing_state_type";
import { Player } from "./Player";
import { DbConnection } from "../generated";

interface PlayingProps {
  playingState: PlayingState;
  connectionIdentity: string;
  conn: DbConnection;
}

export function Playing({
  playingState,
  connectionIdentity,
  conn,
}: PlayingProps) {
  const handleEndTurn = async () => {
    if (!conn) return;
    try {
      await conn.reducers.endTurn();
    } catch (error) {
      console.error("Failed to end turn:", error);
    }
  };

  const handleUpdateWord = async (word: string) => {
    if (!conn) return;
    try {
      await conn.reducers.updateCurrentWord(word);
    } catch (error) {
      console.error("Failed to update word:", error);
    }
  };

  return (
    <div>
      <div className="text-xl text-gray-300 mb-4">
        Turn #{playingState.turnNumber}
      </div>

      <h2 className="text-2xl mb-4">Players ({playingState.players.length})</h2>
      <div className="flex flex-col gap-2">
        {[...playingState.players]
          .sort((a, b) => {
            // Find indices in original array
            const indexA = playingState.players.findIndex(
              (p) => p.identity.toHexString() === a.identity.toHexString()
            );
            const indexB = playingState.players.findIndex(
              (p) => p.identity.toHexString() === b.identity.toHexString()
            );

            // Find current player's index
            const currentPlayerIndex = playingState.players.findIndex(
              (p) => p.identity.toHexString() === connectionIdentity
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
            // Check if this is the current player (you)
            const isCurrentPlayer =
              player.identity.toHexString() === connectionIdentity;

            // Check if it's this player's turn by finding their index in the original array
            const playerIndex = playingState.players.findIndex(
              (p) => p.identity.toHexString() === player.identity.toHexString()
            );
            const isTheirTurn =
              playerIndex ===
              playingState.currentTurnIndex % playingState.players.length;

            return (
              <Player
                key={player.identity.toHexString()}
                player={player}
                isCurrentPlayer={isCurrentPlayer}
                isTheirTurn={isTheirTurn}
                onEndTurn={handleEndTurn}
                onUpdateWord={handleUpdateWord}
              />
            );
          })}
      </div>
    </div>
  );
}
