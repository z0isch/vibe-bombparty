import { Identity } from '@clockworklabs/spacetimedb-sdk';

import { useEffect, useState } from 'react';

import { eventQueue } from '../eventQueue';
import * as moduleBindings from '../generated';
import { PlayerGameData } from '../generated/player_game_data_type';
import { setupSoundEffects } from '../soundEffects';

export function useSpacetimeDB(): moduleBindings.DbConnection | null {
  const [conn, setConn] = useState<moduleBindings.DbConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Set up sound effects when connection is established
  useEffect(() => {
    if (!conn?.identity) return;

    // Set up sound effects and get cleanup function
    const cleanupSoundEffects = setupSoundEffects(conn.identity);

    // Clean up when connection changes or component unmounts
    return cleanupSoundEffects;
  }, [conn?.identity]);

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
              localStorage.setItem('token', token);
            }
          )
          .onDisconnect(() => {
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

  return isConnected ? conn : null;
}
