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
import { SettingsState as __SettingsState } from "./settings_state_type";
import { PlayerGameData as __PlayerGameData } from "./player_game_data_type";
import { PlayerEvents as __PlayerEvents } from "./player_events_type";

export type PlayingState = {
  players: __PlayerGameData[],
  currentTurnIndex: number,
  turnNumber: number,
  settings: __SettingsState,
  playerEvents: __PlayerEvents[],
  currentTrigram: string,
  failedPlayers: Identity[],
  usedWords: string[],
};

/**
 * A namespace for generated helper functions.
 */
export namespace PlayingState {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("players", AlgebraicType.createArrayType(__PlayerGameData.getTypeScriptAlgebraicType())),
      new ProductTypeElement("currentTurnIndex", AlgebraicType.createU32Type()),
      new ProductTypeElement("turnNumber", AlgebraicType.createU32Type()),
      new ProductTypeElement("settings", __SettingsState.getTypeScriptAlgebraicType()),
      new ProductTypeElement("playerEvents", AlgebraicType.createArrayType(__PlayerEvents.getTypeScriptAlgebraicType())),
      new ProductTypeElement("currentTrigram", AlgebraicType.createStringType()),
      new ProductTypeElement("failedPlayers", AlgebraicType.createArrayType(AlgebraicType.createIdentityType())),
      new ProductTypeElement("usedWords", AlgebraicType.createArrayType(AlgebraicType.createStringType())),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: PlayingState): void {
    PlayingState.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): PlayingState {
    return PlayingState.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


