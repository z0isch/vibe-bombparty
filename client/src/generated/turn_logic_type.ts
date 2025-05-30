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
import { ClassicTurnLogic as __ClassicTurnLogic } from "./classic_turn_logic_type";
import { SimultaneousTurnLogic as __SimultaneousTurnLogic } from "./simultaneous_turn_logic_type";

// A namespace for generated variants and helper functions.
export namespace TurnLogic {
  // These are the generated variant types for each variant of the tagged union.
  // One type is generated per variant and will be used in the `value` field of
  // the tagged union.
  export type Classic = { tag: "Classic", value: __ClassicTurnLogic };
  export type Simultaneous = { tag: "Simultaneous", value: __SimultaneousTurnLogic };

  // Helper functions for constructing each variant of the tagged union.
  // ```
  // const foo = Foo.A(42);
  // assert!(foo.tag === "A");
  // assert!(foo.value === 42);
  // ```
  export const Classic = (value: __ClassicTurnLogic): TurnLogic => ({ tag: "Classic", value });
  export const Simultaneous = (value: __SimultaneousTurnLogic): TurnLogic => ({ tag: "Simultaneous", value });

  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createSumType([
      new SumTypeVariant("Classic", __ClassicTurnLogic.getTypeScriptAlgebraicType()),
      new SumTypeVariant("Simultaneous", __SimultaneousTurnLogic.getTypeScriptAlgebraicType()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: TurnLogic): void {
      TurnLogic.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): TurnLogic {
      return TurnLogic.getTypeScriptAlgebraicType().deserialize(reader);
  }

}

// The tagged union or sum type for the algebraic type `TurnLogic`.
export type TurnLogic = TurnLogic.Classic | TurnLogic.Simultaneous;

export default TurnLogic;

