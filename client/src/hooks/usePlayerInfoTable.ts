import { useEffect, useState } from 'react';

import * as moduleBindings from '../generated';
import { PlayerInfoTable } from '../generated/player_info_table_type';

export function usePlayerInfoTable(conn: moduleBindings.DbConnection | null) {
  const [playerInfos, setPlayerInfos] = useState<PlayerInfoTable[]>([]);
  const [subscription, setSubscription] = useState<ReturnType<
    typeof conn.subscriptionBuilder.prototype.subscribe
  > | null>(null);
  const [showNameDialog, setShowNameDialog] = useState(false);

  useEffect(() => {
    if (!conn || subscription !== null) return;
    setPlayerInfos(Array.from(conn.db.playerInfo.iter()));

    // Set up subscription
    const newSubscription = conn
      .subscriptionBuilder()
      .onApplied(() => {
        const playerInfo = Array.from(conn.db.playerInfo.iter()).find(
          (p) => p.identity.toHexString() === conn.identity.toHexString()
        );

        // Check if we need to register the player
        const storedIdentity = localStorage.getItem('identity');
        if (!storedIdentity || storedIdentity !== conn.identity.toHexString()) {
          // Store the new identity
          localStorage.setItem('identity', conn.identity.toHexString());
        }
        if (!playerInfo) {
          setShowNameDialog(true);
        }
      })
      .onError((error) => {
        console.error('Player info subscription error:', error);
      })
      .subscribe(['SELECT * FROM player_info']);

    setSubscription(newSubscription);

    // Register player info callbacks
    conn.db.playerInfo.onInsert((_ctx, playerInfo) => {
      setPlayerInfos((prev) => [...prev, playerInfo]);
    });

    conn.db.playerInfo.onUpdate((_ctx, _oldPlayerInfo, newPlayerInfo) => {
      setPlayerInfos((prev) =>
        prev.map((p) =>
          p.identity.toHexString() === newPlayerInfo.identity.toHexString() ? newPlayerInfo : p
        )
      );
    });

    conn.db.playerInfo.onDelete((_ctx, playerInfo) => {
      setPlayerInfos((prev) =>
        prev.filter((p) => p.identity.toHexString() !== playerInfo.identity.toHexString())
      );
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
        setSubscription(null);
      }
    };
  }, [conn, subscription]);

  return { playerInfos, showNameDialog, setShowNameDialog };
}
