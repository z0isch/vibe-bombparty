import { DbConnection } from '../generated';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { useGameStateTable } from '../hooks/useGameStateTable';
import { Countdown } from './Countdown';
import { Playing } from './Playing';
import { Settings } from './Settings';

interface GameStateProps {
  gameId: number;
  conn: DbConnection | null;
  playerInfos: PlayerInfoTable[];
  onJoinGame: () => void;
}

export function GameState({ gameId, conn, playerInfos, onJoinGame }: GameStateProps) {
  const gameStateTable = useGameStateTable(conn, gameId);

  if (!gameStateTable?.state || !conn) return null;

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
        <Settings
          gameId={gameStateTable.gameId}
          turnTimeoutSeconds={gameStateTable.state.value.turnTimeoutSeconds}
          players={gameStateTable.state.value.players}
          playerInfos={playerInfos}
          conn={conn}
          onJoinGame={onJoinGame}
          isCurrentPlayer={!!getCurrentPlayer()}
        />
      );
    case 'Countdown':
      return <Countdown countdownState={gameStateTable.state.value} playerInfos={playerInfos} />;
    case 'Playing':
      return (
        <Playing
          gameId={gameStateTable.gameId}
          playingState={gameStateTable.state.value}
          playerInfos={playerInfos}
          conn={conn}
        />
      );
    default: {
      // This ensures we handle all possible states
      const _exhaustiveCheck: never = gameStateTable.state;
      return null;
    }
  }
}
