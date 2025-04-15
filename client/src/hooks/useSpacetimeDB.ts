import { useEffect, useState } from "react";
import * as moduleBindings from "../generated";
import { Game } from "../generated/game_type";
import { PlayerGameData } from "../generated/player_game_data_type";
import { PlayerInfoTable } from "../generated/player_info_table_type";
import { Identity } from "@clockworklabs/spacetimedb-sdk";

export interface SpacetimeDBState {
  game: Game | null;
  connectionIdentity: string | null;
  isSubscribed: boolean;
  currentPlayer: PlayerGameData | null;
  playerInfos: PlayerInfoTable[];
  isConnected: boolean;
  conn: moduleBindings.DbConnection | null;
}

export interface SpacetimeDBActions {
  registerPlayer: (username: string) => Promise<void>;
}

export function useSpacetimeDB(): [SpacetimeDBState, SpacetimeDBActions] {
  const [conn, setConn] = useState<moduleBindings.DbConnection | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [playerInfos, setPlayerInfos] = useState<PlayerInfoTable[]>([]);
  const [connectionIdentity, setConnectionIdentity] = useState<string | null>(
    null
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Helper function to get current player from game
  const getCurrentPlayer = () => {
    if (!connectionIdentity || !game) return null;
    return (
      game.state.value.players.find(
        (p) => p.playerIdentity.toHexString() === connectionIdentity
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
      .subscribe(["SELECT * FROM game", "SELECT * FROM player_info"]);

    // Register callbacks
    conn.db.game.onInsert((ctx, gameData) => {
      console.log("Game updated:", {
        playerCount: gameData.state.value.players.length,
      });
      setGame(gameData);
    });

    conn.db.game.onUpdate((ctx, oldGameData, newGameData) => {
      console.log("Game updated:", {
        playerCount: newGameData.state.value.players.length,
      });
      setGame(newGameData);
    });

    conn.db.game.onDelete((ctx, gameData) => {
      console.log("Game deleted");
      setGame(null);
    });

    // Register player info callbacks
    conn.db.playerInfo.onInsert((ctx, playerInfo) => {
      setPlayerInfos((prev) => [...prev, playerInfo]);
    });

    conn.db.playerInfo.onUpdate((ctx, oldPlayerInfo, newPlayerInfo) => {
      setPlayerInfos((prev) =>
        prev.map((p) =>
          p.identity.toHexString() === newPlayerInfo.identity.toHexString()
            ? newPlayerInfo
            : p
        )
      );
    });

    conn.db.playerInfo.onDelete((ctx, playerInfo) => {
      setPlayerInfos((prev) =>
        prev.filter(
          (p) => p.identity.toHexString() !== playerInfo.identity.toHexString()
        )
      );
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
      playerInfos,
      isConnected,
      conn,
    },
    {
      registerPlayer,
    },
  ];
}
