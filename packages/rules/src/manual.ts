import { Schema } from "effect"

// Views travel to clients as plain JSON, and Convex return validators type arrays as mutable.
export const MutableArray = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item))

export const ManualBlock = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("table"),
    columns: MutableArray(Schema.String),
    rows: MutableArray(MutableArray(Schema.String)),
  }),
])
export type ManualBlock = typeof ManualBlock.Type

export const ManualSection = Schema.Struct({ title: Schema.String, blocks: MutableArray(ManualBlock) })
export type ManualSection = typeof ManualSection.Type
