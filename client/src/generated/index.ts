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
import { StartGame } from "./start_game_reducer.ts";
export { StartGame };
import { SubmitWord } from "./submit_word_reducer.ts";
export { SubmitWord };
import { TurnTimeout } from "./turn_timeout_reducer.ts";
export { TurnTimeout };
import { UpdateCurrentWord } from "./update_current_word_reducer.ts";
export { UpdateCurrentWord };
import { UpdateTurnTimeout } from "./update_turn_timeout_reducer.ts";
export { UpdateTurnTimeout };

// Import and reexport all table handle types
import { GameTableHandle } from "./game_table.ts";
export { GameTableHandle };
import { PlayerInfoTableHandle } from "./player_info_table.ts";
export { PlayerInfoTableHandle };
import { TurnTimeoutScheduleTableHandle } from "./turn_timeout_schedule_table.ts";
export { TurnTimeoutScheduleTableHandle };

// Import and reexport all types
import { Game } from "./game_type.ts";
export { Game };
import { GameState } from "./game_state_type.ts";
export { GameState };
import { PlayerGameData } from "./player_game_data_type.ts";
export { PlayerGameData };
import { PlayerInfoTable } from "./player_info_table_type.ts";
export { PlayerInfoTable };
import { PlayingState } from "./playing_state_type.ts";
export { PlayingState };
import { SettingsState } from "./settings_state_type.ts";
export { SettingsState };
import { TurnTimeoutSchedule } from "./turn_timeout_schedule_type.ts";
export { TurnTimeoutSchedule };

const REMOTE_MODULE = {
  tables: {
    game: {
      tableName: "game",
      rowType: Game.getTypeScriptAlgebraicType(),
      primaryKey: "id",
    },
    player_info: {
      tableName: "player_info",
      rowType: PlayerInfoTable.getTypeScriptAlgebraicType(),
      primaryKey: "identity",
    },
    turn_timeout_schedule: {
      tableName: "turn_timeout_schedule",
      rowType: TurnTimeoutSchedule.getTypeScriptAlgebraicType(),
      primaryKey: "scheduledId",
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
    start_game: {
      reducerName: "start_game",
      argsType: StartGame.getTypeScriptAlgebraicType(),
    },
    submit_word: {
      reducerName: "submit_word",
      argsType: SubmitWord.getTypeScriptAlgebraicType(),
    },
    turn_timeout: {
      reducerName: "turn_timeout",
      argsType: TurnTimeout.getTypeScriptAlgebraicType(),
    },
    update_current_word: {
      reducerName: "update_current_word",
      argsType: UpdateCurrentWord.getTypeScriptAlgebraicType(),
    },
    update_turn_timeout: {
      reducerName: "update_turn_timeout",
      argsType: UpdateTurnTimeout.getTypeScriptAlgebraicType(),
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
| { name: "StartGame", args: StartGame }
| { name: "SubmitWord", args: SubmitWord }
| { name: "TurnTimeout", args: TurnTimeout }
| { name: "UpdateCurrentWord", args: UpdateCurrentWord }
| { name: "UpdateTurnTimeout", args: UpdateTurnTimeout }
;

export class RemoteReducers {
  constructor(private connection: DbConnectionImpl, private setCallReducerFlags: SetReducerFlags) {}

  onIdentityConnected(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("identity_connected", callback);
  }

  removeOnIdentityConnected(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("identity_connected", callback);
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

  startGame() {
    this.connection.callReducer("start_game", new Uint8Array(0), this.setCallReducerFlags.startGameFlags);
  }

  onStartGame(callback: (ctx: ReducerEventContext) => void) {
    this.connection.onReducer("start_game", callback);
  }

  removeOnStartGame(callback: (ctx: ReducerEventContext) => void) {
    this.connection.offReducer("start_game", callback);
  }

  submitWord(word: string) {
    const __args = { word };
    let __writer = new BinaryWriter(1024);
    SubmitWord.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("submit_word", __argsBuffer, this.setCallReducerFlags.submitWordFlags);
  }

  onSubmitWord(callback: (ctx: ReducerEventContext, word: string) => void) {
    this.connection.onReducer("submit_word", callback);
  }

  removeOnSubmitWord(callback: (ctx: ReducerEventContext, word: string) => void) {
    this.connection.offReducer("submit_word", callback);
  }

  turnTimeout(arg: TurnTimeoutSchedule) {
    const __args = { arg };
    let __writer = new BinaryWriter(1024);
    TurnTimeout.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("turn_timeout", __argsBuffer, this.setCallReducerFlags.turnTimeoutFlags);
  }

  onTurnTimeout(callback: (ctx: ReducerEventContext, arg: TurnTimeoutSchedule) => void) {
    this.connection.onReducer("turn_timeout", callback);
  }

  removeOnTurnTimeout(callback: (ctx: ReducerEventContext, arg: TurnTimeoutSchedule) => void) {
    this.connection.offReducer("turn_timeout", callback);
  }

  updateCurrentWord(word: string) {
    const __args = { word };
    let __writer = new BinaryWriter(1024);
    UpdateCurrentWord.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("update_current_word", __argsBuffer, this.setCallReducerFlags.updateCurrentWordFlags);
  }

  onUpdateCurrentWord(callback: (ctx: ReducerEventContext, word: string) => void) {
    this.connection.onReducer("update_current_word", callback);
  }

  removeOnUpdateCurrentWord(callback: (ctx: ReducerEventContext, word: string) => void) {
    this.connection.offReducer("update_current_word", callback);
  }

  updateTurnTimeout(seconds: number) {
    const __args = { seconds };
    let __writer = new BinaryWriter(1024);
    UpdateTurnTimeout.getTypeScriptAlgebraicType().serialize(__writer, __args);
    let __argsBuffer = __writer.getBuffer();
    this.connection.callReducer("update_turn_timeout", __argsBuffer, this.setCallReducerFlags.updateTurnTimeoutFlags);
  }

  onUpdateTurnTimeout(callback: (ctx: ReducerEventContext, seconds: number) => void) {
    this.connection.onReducer("update_turn_timeout", callback);
  }

  removeOnUpdateTurnTimeout(callback: (ctx: ReducerEventContext, seconds: number) => void) {
    this.connection.offReducer("update_turn_timeout", callback);
  }

}

export class SetReducerFlags {
  registerPlayerFlags: CallReducerFlags = 'FullUpdate';
  registerPlayer(flags: CallReducerFlags) {
    this.registerPlayerFlags = flags;
  }

  startGameFlags: CallReducerFlags = 'FullUpdate';
  startGame(flags: CallReducerFlags) {
    this.startGameFlags = flags;
  }

  submitWordFlags: CallReducerFlags = 'FullUpdate';
  submitWord(flags: CallReducerFlags) {
    this.submitWordFlags = flags;
  }

  turnTimeoutFlags: CallReducerFlags = 'FullUpdate';
  turnTimeout(flags: CallReducerFlags) {
    this.turnTimeoutFlags = flags;
  }

  updateCurrentWordFlags: CallReducerFlags = 'FullUpdate';
  updateCurrentWord(flags: CallReducerFlags) {
    this.updateCurrentWordFlags = flags;
  }

  updateTurnTimeoutFlags: CallReducerFlags = 'FullUpdate';
  updateTurnTimeout(flags: CallReducerFlags) {
    this.updateTurnTimeoutFlags = flags;
  }

}

export class RemoteTables {
  constructor(private connection: DbConnectionImpl) {}

  get game(): GameTableHandle {
    return new GameTableHandle(this.connection.clientCache.getOrCreateTable<Game>(REMOTE_MODULE.tables.game));
  }

  get playerInfo(): PlayerInfoTableHandle {
    return new PlayerInfoTableHandle(this.connection.clientCache.getOrCreateTable<PlayerInfoTable>(REMOTE_MODULE.tables.player_info));
  }

  get turnTimeoutSchedule(): TurnTimeoutScheduleTableHandle {
    return new TurnTimeoutScheduleTableHandle(this.connection.clientCache.getOrCreateTable<TurnTimeoutSchedule>(REMOTE_MODULE.tables.turn_timeout_schedule));
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
