import { Identity } from '@clockworklabs/spacetimedb-sdk';

import { useEffect, useState } from 'react';

import { eventQueue } from '../eventQueue';
import * as moduleBindings from '../generated';
import { PlayerGameData } from '../generated/player_game_data_type';
import { PlayerInfoTable } from '../generated/player_info_table_type';
import { setupSoundEffects } from '../soundEffects';

export interface SpacetimeDBState {
  connectionIdentity: string | null;
  isSubscribed: boolean;
  playerInfos: PlayerInfoTable[];
  isConnected: boolean;
  conn: moduleBindings.DbConnection | null;
}

export function useSpacetimeDB(): SpacetimeDBState {
  const [conn, setConn] = useState<moduleBindings.DbConnection | null>(null);
  const [playerInfos, setPlayerInfos] = useState<PlayerInfoTable[]>([]);
  const [connectionIdentity, setConnectionIdentity] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Set up sound effects when connection is established
  useEffect(() => {
    if (!conn?.identity) return;

    // Set up sound effects and get cleanup function
    const cleanupSoundEffects = setupSoundEffects(conn.identity);

    // Clean up when connection changes or component unmounts
    return cleanupSoundEffects;
  }, [conn?.identity]);

  // Set up subscription and callbacks
  useEffect(() => {
    if (!conn || !isConnected || isSubscribed) return;

    // Set up subscription
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        setIsSubscribed(true);
      })
      .onError((error) => {
        console.error('Subscription error:', error);
        setIsSubscribed(false);
      })
      .subscribe(['SELECT * FROM player_info']);

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

    conn.db.playerInfo.onDelete((ctx, playerInfo) => {
      setPlayerInfos((prev) =>
        prev.filter((p) => p.identity.toHexString() !== playerInfo.identity.toHexString())
      );
    });
  }, [conn, isConnected, isSubscribed, connectionIdentity]);

  // Set up connection
  useEffect(() => {
    const connect = async () => {
      try {
        const connection = await moduleBindings.DbConnection.builder()
          .withUri(import.meta.env.VITE_SPACETIME_WS_URI)
          .withToken(localStorage.getItem('token') || undefined)
          .withModuleName('vibe-bombparty')
          .onConnect(
            (connection: moduleBindings.DbConnection, identity: Identity, token: string) => {
              setIsConnected(true);

              // Store connection identity and token
              const identityStr = identity.toHexString();
              setConnectionIdentity(identityStr);
              localStorage.setItem('token', token);
            }
          )
          .onDisconnect(() => {
            setConnectionIdentity(null);
            setIsSubscribed(false);
            setIsConnected(false);
          })
          .build();

        setConn(connection);
      } catch (error) {
        console.error('Failed to connect:', error);
      }
    };

    connect();

    return () => {
      conn?.disconnect();
      setConn(null);
    };
  }, []);

  return {
    connectionIdentity,
    isSubscribed,
    playerInfos,
    isConnected,
    conn,
  };
}
