import { Identity } from '@clockworklabs/spacetimedb-sdk';

import { useEffect, useRef, useState } from 'react';

import * as moduleBindings from '../generated';
import { setupSoundEffects } from '../soundEffects';

export function useSpacetimeDB(): moduleBindings.DbConnection | null {
  const connRef = useRef<moduleBindings.DbConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Set up sound effects when connection is established
  useEffect(() => {
    if (!connRef.current?.identity && !isConnected) return;

    // Set up sound effects and get cleanup function
    const cleanupSoundEffects = setupSoundEffects(connRef.current.identity);

    // Clean up when connection changes or component unmounts
    return cleanupSoundEffects;
  }, [connRef.current?.identity, isConnected]);

  // Set up connection
  useEffect(() => {
    const connect = async () => {
      try {
        const connection = await moduleBindings.DbConnection.builder()
          .withUri(import.meta.env.VITE_SPACETIME_WS_URI)
          .withToken(localStorage.getItem('token') || undefined)
          .withModuleName('vibe-bombparty')
          .onConnect(
            async (connection: moduleBindings.DbConnection, identity: Identity, token: string) => {
              // Store the token
              localStorage.setItem('token', token);

              // Check if we need to register the player
              const storedIdentity = localStorage.getItem('identity');
              if (!storedIdentity || storedIdentity !== identity.toHexString()) {
                // We need to register - prompt for username
                const username = prompt('Enter your username:');
                if (username) {
                  try {
                    // Register the player
                    await connection.reducers.registerPlayer(username);
                    // Store the new identity
                    localStorage.setItem('identity', identity.toHexString());
                  } catch (error) {
                    console.error('Failed to register player:', error);
                  }
                }
              }

              setIsConnected(true);
            }
          )
          .onDisconnect(() => {
            setIsConnected(false);
          })
          .build();

        connRef.current = connection;
      } catch (error) {
        console.error('Failed to connect:', error);
      }
    };

    connect();

    return () => {
      connRef.current?.disconnect();
      connRef.current = null;
    };
  }, []);

  return isConnected ? connRef.current : null;
}
