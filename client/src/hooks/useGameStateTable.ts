import { useEffect, useState } from 'react';

import { eventQueue } from '../eventQueue';
import * as moduleBindings from '../generated';
import { GameStateTable } from '../generated/game_state_table_type';

export function useGameStateTable(conn: moduleBindings.DbConnection | null, gameId: number) {
  const [gameStateTable, setGameStateTable] = useState<GameStateTable | null>(null);
  const [subscription, setSubscription] = useState<ReturnType<
    typeof conn.subscriptionBuilder.prototype.subscribe
  > | null>(null);

  useEffect(() => {
    if (!conn || subscription !== null) return;
    setGameStateTable(Array.from(conn.db.gameState.iter()).find((g) => g.gameId === gameId));

    // Set up subscription
    const newSubscription = conn
      .subscriptionBuilder()
      .onApplied(() => {
        // Subscription applied successfully
      })
      .onError((error) => {
        console.error('Game state subscription error:', error);
      })
      .subscribe([`SELECT * FROM game_state WHERE game_id = ${gameId}`]);

    setSubscription(newSubscription);

    // Register callbacks
    conn.db.gameState.onInsert((ctx, gameStateData) => {
      if (gameStateData.gameId === gameId) {
        setGameStateTable(gameStateData);
        if (gameStateData.state.tag === 'Playing') {
          eventQueue.publishEvents(gameStateData.state.value.players);
        }
      }
    });

    conn.db.gameState.onUpdate((ctx, oldGameStateData, newGameStateData) => {
      if (newGameStateData.gameId === gameId) {
        setGameStateTable(newGameStateData);
        if (newGameStateData.state.tag === 'Playing') {
          eventQueue.publishEvents(newGameStateData.state.value.players);
        }
      }
    });

    conn.db.gameState.onDelete((ctx, gameStateData) => {
      if (gameStateData.gameId === gameId) {
        setGameStateTable(null);
      }
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
        setSubscription(null);
      }
    };
  }, [conn, gameId, subscription]);

  return gameStateTable;
}
