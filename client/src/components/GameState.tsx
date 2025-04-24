import { DbConnection } from '../generated';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { useGameStateTable } from '../hooks/useGameStateTable';
import { Countdown } from './Countdown';
import { Playing } from './Playing';
import { Settings } from './Settings';

interface GameStateProps {
  gameId: number;
  conn: DbConnection | null;
  isConnected: boolean;
  playerInfos: PlayerInfoTable[];
  connectionIdentity: string | null;
  onJoinGame: () => void;
}

export function GameState({
  gameId,
  conn,
  isConnected,
  playerInfos,
  connectionIdentity,
  onJoinGame,
}: GameStateProps) {
  const gameStateTable = useGameStateTable(conn, gameId, isConnected);

  if (!gameStateTable?.state || !conn) return null;

  // Helper function to get current player from game state
  const getCurrentPlayer = () => {
    if (!connectionIdentity || !gameStateTable?.state) return null;
    switch (gameStateTable.state.tag) {
      case 'Countdown':
        return (
          gameStateTable.state.value.settings.players.find(
            (p) => p.playerIdentity.toHexString() === connectionIdentity
          ) || null
        );
      case 'Playing':
        return (
          gameStateTable.state.value.players.find(
            (p) => p.playerIdentity.toHexString() === connectionIdentity
          ) || null
        );
      case 'Settings':
        return (
          gameStateTable.state.value.players.find(
            (p) => p.playerIdentity.toHexString() === connectionIdentity
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
      if (!connectionIdentity) return null;
      return (
        <Playing
          gameId={gameStateTable.gameId}
          playingState={gameStateTable.state.value}
          playerInfos={playerInfos}
          connectionIdentity={connectionIdentity}
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
