// THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB. EDITS TO THIS FILE
// WILL NOT BE SAVED. MODIFY TABLES IN YOUR MODULE SOURCE CODE INSTEAD.

/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
import {
  AlgebraicType,
  AlgebraicValue,
  BinaryReader,
  BinaryWriter,
  CallReducerFlags,
  ConnectionId,
  DbConnectionBuilder,
  DbConnectionImpl,
  DbContext,
  ErrorContextInterface,
  Event,
  EventContextInterface,
  Identity,
  ProductType,
  ProductTypeElement,
  ReducerEventContextInterface,
  SubscriptionBuilderImpl,
  SubscriptionEventContextInterface,
  SumType,
  SumTypeVariant,
  TableCache,
  TimeDuration,
  Timestamp,
  deepEqual,
} from "@clockworklabs/spacetimedb-sdk";

// Import and reexport all reducer arg types
import { IdentityConnected } from "./identity_connected_reducer.ts";
export { IdentityConnected };
import { IdentityDisconnected } from "./identity_disconnected_reducer.ts";
export { IdentityDisconnected };
import { RegisterPlayer } from "./register_player_reducer.ts";
export { RegisterPlayer };

// Import and reexport all table handle types
import { PlayerTableHandle } from "./player_table.ts";
export { PlayerTableHandle };

// Import and reexport all types
import { PlayerData } from "./player_data_type.ts";
export { PlayerData };

const REMOTE_MODULE = {
  tables: {
    player: {
      tableName: "player",
      rowType: PlayerData.getTypeScriptAlgebraicType(),
      primaryKey: "identity",
    },
  },
  reducers: {
    identity_connected: {
      reducerName: "identity_connected",
      argsType: IdentityConnected.getTypeScriptAlgebraicType(),
    },
    identity_disconnected: {
      reducerName: "identity_disconnected",
      argsType: IdentityDisconnected.getTypeScriptAlgebraicType(),
    },
    register_player: {
      reducerName: "register_player",
      argsType: RegisterPlayer.getTypeScriptAlgebraicType(),
    },
  },
  // Constructors which are used by the DbConnectionImpl to
  // extract type information from the generated RemoteModule.
  //
  // NOTE: This is not strictly necessary for `eventContextConstructor` because
  // all we do is build a TypeScript object which we could have done inside the
  // SDK, but if in the future we wanted to create a class this would be
  // necessary because classes have methods, so we'll keep it.
  eventContextConstructor: (imp: DbConnectionImpl, event: Event<Reducer>) => {
    return {
      ...(imp as DbConnection),
      event
    }
  },
  dbViewConstructor: (imp: DbConnectionImpl) => {
    return new RemoteTables(imp);
  },
  reducersConstructor: (imp: DbConnectionImpl, setReducerFlags: SetReducerFlags) => {
    return new RemoteReducers(imp, setReducerFlags);
  },
  setReducerFlagsConstructor: () => {
    return new SetReducerFlags();
  }
}

// A type representing all the possible variants of a reducer.
export type Reducer = never
| { name: "IdentityConnected", args: IdentityConnected }
| { name: "IdentityDisconnected", args: IdentityDisconnected }
| { name: "RegisterPlayer", args: RegisterPlayer }
;

export class RemoteReducers {
  constructor(private connection: DbConnectionImpl, private setCallReducerFlags: SetReducerFlags) {}

  identityConnected() {
    this.connection.callReducer("identity_connected", new Uint8Array(0), this.setCallReducerFlags.identityConnectedFlags);
  }

  onIdentityConnected(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("identity_connected", callback);
  }

  removeOnIdentityConnected(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("identity_connected", callback);
  }

  identityDisconnected() {
    this.connection.callReducer("identity_disconnected", new Uint8Array(0), this.setCallReducerFlags.identityDisconnectedFlags);
  }

  onIdentityDisconnected(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("identity_disconnected", callback);
  }

  removeOnIdentityDisconnected(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("identity_disconnected", callback);
  }

  registerPlayer(username: string) {
    const __args = { username };
    let __writer = new BinaryWriter(1024);
    RegisterPlayer.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("register_player", __argsBuffer, this.setCallReducerFlags.registerPlayerFlags);
  }

  onRegisterPlayer(callback: (ctx: ReducerEventContext, username: string) => void) {
    this.connection.onReducer("register_player", callback);
  }

  removeOnRegisterPlayer(callback: (ctx: ReducerEventContext, username: string) => void) {
    this.connection.offReducer("register_player", callback);
  }

}

export class SetReducerFlags {
  identityConnectedFlags: CallReducerFlags = 'FullUpdate';
  identityConnected(flags: CallReducerFlags) {
    this.identityConnectedFlags = flags;
  }

  identityDisconnectedFlags: CallReducerFlags = 'FullUpdate';
  identityDisconnected(flags: CallReducerFlags) {
    this.identityDisconnectedFlags = flags;
  }

  registerPlayerFlags: CallReducerFlags = 'FullUpdate';
  registerPlayer(flags: CallReducerFlags) {
    this.registerPlayerFlags = flags;
  }

}

export class RemoteTables {
  constructor(private connection: DbConnectionImpl) {}

  get player(): PlayerTableHandle {
    return new PlayerTableHandle(this.connection.clientCache.getOrCreateTable<PlayerData>(REMOTE_MODULE.tables.player));
  }
}

export class SubscriptionBuilder extends SubscriptionBuilderImpl<RemoteTables, RemoteReducers, SetReducerFlags> { }

export class DbConnection extends DbConnectionImpl<RemoteTables, RemoteReducers, SetReducerFlags> {
  static builder = (): DbConnectionBuilder<DbConnection, ErrorContext, SubscriptionEventContext> => {
    return new DbConnectionBuilder<DbConnection, ErrorContext, SubscriptionEventContext>(REMOTE_MODULE, (imp: DbConnectionImpl) => imp as DbConnection);
  }
  subscriptionBuilder = (): SubscriptionBuilder => {
    return new SubscriptionBuilder(this);
  }
}

export type EventContext = EventContextInterface<RemoteTables, RemoteReducers, SetReducerFlags, Reducer>;
export type ReducerEventContext = ReducerEventContextInterface<RemoteTables, RemoteReducers, SetReducerFlags, Reducer>;
export type SubscriptionEventContext = SubscriptionEventContextInterface<RemoteTables, RemoteReducers, SetReducerFlags>;
export type ErrorContext = ErrorContextInterface<RemoteTables, RemoteReducers, SetReducerFlags>;
