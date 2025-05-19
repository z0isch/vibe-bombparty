import { DbConnection, Game } from '../generated';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { useGameStateTable } from '../hooks/useGameStateTable';
import { Countdown } from './Countdown';
import { Playing } from './Playing';
import { Settings } from './Settings';

interface GameStateProps {
  game: Game;
  conn: DbConnection;
  playerInfos: PlayerInfoTable[];
}

// Header component to show game name consistently across states
function GameHeader({ name }: { name: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-yellow-400">{name}</h1>
    </div>
  );
}

export function GameState({ game, conn, playerInfos }: GameStateProps) {
  const gameStateTable = useGameStateTable(conn, game.id);

  if (!gameStateTable?.state) return null;

  // Helper function to get current player from game state
  const getCurrentPlayer = () => {
    if (!conn.identity || !gameStateTable?.state) return null;
    switch (gameStateTable.state.tag) {
      case 'Countdown':
        return (
          gameStateTable.state.value.settings.players.find(
            (p) => p.playerIdentity.toHexString() === conn.identity.toHexString()
          ) || null
        );
      case 'Playing':
        return (
          gameStateTable.state.value.players.find(
            (p) => p.playerIdentity.toHexString() === conn.identity.toHexString()
          ) || null
        );
      case 'Settings':
        return (
          gameStateTable.state.value.players.find(
            (p) => p.playerIdentity.toHexString() === conn.identity.toHexString()
          ) || null
        );
      default:
        return null;
    }
  };

  switch (gameStateTable.state.tag) {
    case 'Settings':
      return (
        <div>
          <GameHeader name={game.name} />
          <Settings
            gameId={gameStateTable.gameId}
            turnTimeoutSeconds={gameStateTable.state.value.turnTimeoutSeconds}
            players={gameStateTable.state.value.players}
            playerInfos={playerInfos}
            playerWins={gameStateTable.playerWins}
            conn={conn}
            isCurrentPlayer={!!getCurrentPlayer()}
            winCondition={gameStateTable.state.value.winCondition}
          />
        </div>
      );
    case 'Countdown':
      return (
        <div>
          <GameHeader name={game.name} />
          <Countdown countdownState={gameStateTable.state.value} playerInfos={playerInfos} />
        </div>
      );
    case 'Playing':
      return (
        <div>
          <GameHeader name={game.name} />
          <Playing
            gameId={gameStateTable.gameId}
            playingState={gameStateTable.state.value}
            playerInfos={playerInfos}
            conn={conn}
          />
        </div>
      );
    default: {
      // This ensures we handle all possible states
      const _exhaustiveCheck: never = gameStateTable.state;
      return null;
    }
  }
}
