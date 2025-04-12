import { useEffect, useState } from "react";
import * as moduleBindings from "../generated";
import { GameData } from "../generated/game_data_type";
import { PlayerData } from "../generated/player_data_type";
import { Identity } from "@clockworklabs/spacetimedb-sdk";

export interface SpacetimeDBState {
  game: GameData | null;
  connectionIdentity: string | null;
  isSubscribed: boolean;
  currentPlayer: PlayerData | null;
  isConnected: boolean;
  conn: moduleBindings.DbConnection | null;
}

export interface SpacetimeDBActions {
  registerPlayer: (username: string) => Promise<void>;
}

export function useSpacetimeDB(): [SpacetimeDBState, SpacetimeDBActions] {
  const [conn, setConn] = useState<moduleBindings.DbConnection | null>(null);
  const [game, setGame] = useState<GameData | null>(null);
  const [connectionIdentity, setConnectionIdentity] = useState<string | null>(
    null
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Helper function to get current player from game
  const getCurrentPlayer = () => {
    if (!connectionIdentity || !game) return null;
    return (
      game.players.find(
        (p) => p.identity.toHexString() === connectionIdentity
      ) || null
    );
  };

  // Set up subscription and callbacks
  useEffect(() => {
    if (!conn || !isConnected || isSubscribed) return;

    console.log("Setting up subscription...");

    // Set up subscription
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        console.log("Subscription applied");
        setIsSubscribed(true);
      })
      .onError((error) => {
        console.error("Subscription error:", error);
        setIsSubscribed(false);
      })
      .subscribe("SELECT * FROM game");

    // Register callbacks
    conn.db.game.onInsert((ctx, gameData) => {
      console.log("Game updated:", { playerCount: gameData.players.length });
      setGame(gameData);
    });

    conn.db.game.onUpdate((ctx, oldGameData, newGameData) => {
      console.log("Game updated:", { playerCount: newGameData.players.length });
      setGame(newGameData);
    });

    conn.db.game.onDelete((ctx, gameData) => {
      console.log("Game deleted");
      setGame(null);
    });
  }, [conn, isConnected, isSubscribed]);

  // Set up connection
  useEffect(() => {
    const connect = async () => {
      try {
        const connection = await moduleBindings.DbConnection.builder()
          .withUri("ws://localhost:3000")
          .withToken(localStorage.getItem("token") || undefined)
          .withModuleName("vibe-bombparty")
          .onConnect(
            (
              connection: moduleBindings.DbConnection,
              identity: Identity,
              token: string
            ) => {
              console.log("Connected to SpacetimeDB");
              setIsConnected(true);

              // Store connection identity and token
              const identityStr = identity.toHexString();
              setConnectionIdentity(identityStr);
              localStorage.setItem("token", token);
            }
          )
          .onDisconnect(() => {
            setConnectionIdentity(null);
            setIsSubscribed(false);
            setGame(null);
            setIsConnected(false);
            console.log("Disconnected from SpacetimeDB");
          })
          .build();

        setConn(connection);
      } catch (error) {
        console.error("Failed to connect:", error);
      }
    };

    connect();

    return () => {
      conn?.disconnect();
      setConn(null);
    };
  }, []);

  const registerPlayer = async (username: string) => {
    if (!conn) throw new Error("Not connected to SpacetimeDB");
    await conn.reducers.registerPlayer(username);
  };

  return [
    {
      game,
      connectionIdentity,
      isSubscribed,
      currentPlayer: getCurrentPlayer(),
      isConnected,
      conn,
    },
    {
      registerPlayer,
    },
  ];
}
