import { useEffect, useState } from 'react';

import * as moduleBindings from '../generated';
import { Game } from '../generated/game_type';

export function useGameTable(conn: moduleBindings.DbConnection | null) {
  const [games, setGames] = useState<Game[]>([]);
  const [subscription, setSubscription] = useState<ReturnType<
    typeof conn.subscriptionBuilder.prototype.subscribe
  > | null>(null);

  useEffect(() => {
    if (!conn || subscription !== null) return;
    setGames(Array.from(conn.db.game.iter()));

    // Set up subscription
    const newSubscription = conn
      .subscriptionBuilder()
      .onApplied(() => {
        // Subscription applied successfully
      })
      .onError((error) => {
        console.error('Game subscription error:', error);
      })
      .subscribe(['SELECT * FROM game']);

    setSubscription(newSubscription);

    // Register callbacks
    conn.db.game.onInsert((ctx, gameData) => {
      setGames((prev) => [...prev, gameData]);
    });

    conn.db.game.onUpdate((ctx, oldGameData, newGameData) => {
      setGames((prev) => prev.map((g) => (g.id === newGameData.id ? newGameData : g)));
    });

    conn.db.game.onDelete((ctx, gameData) => {
      setGames((prev) => prev.filter((g) => g.id !== gameData.id));
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
        setSubscription(null);
      }
    };
  }, [conn, subscription]);

  return games;
}
