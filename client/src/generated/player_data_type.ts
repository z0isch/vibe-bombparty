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
export type PlayerData = {
  identity: Identity,
  username: string,
  score: number,
  lastActive: Timestamp,
  isOnline: boolean,
  currentWord: string,
};

/**
 * A namespace for generated helper functions.
 */
export namespace PlayerData {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("identity", AlgebraicType.createIdentityType()),
      new ProductTypeElement("username", AlgebraicType.createStringType()),
      new ProductTypeElement("score", AlgebraicType.createI32Type()),
      new ProductTypeElement("lastActive", AlgebraicType.createTimestampType()),
      new ProductTypeElement("isOnline", AlgebraicType.createBoolType()),
      new ProductTypeElement("currentWord", AlgebraicType.createStringType()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: PlayerData): void {
    PlayerData.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): PlayerData {
    return PlayerData.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


