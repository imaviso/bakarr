// Shared parsed unit identity wire contracts.
import { Schema } from "effect";

export interface ParsedUnitIdentity {
  scheme: "season" | "absolute" | "daily";
  season?: number | undefined | null;
  unit_numbers?: number[] | undefined | null;
  air_dates?: string[] | undefined | null;
  label: string;
}

export const ParsedUnitIdentitySchema = Schema.Struct({
  scheme: Schema.Literals(["season", "absolute", "daily"]),
  season: Schema.optional(Schema.NullishOr(Schema.Number)),
  unit_numbers: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  air_dates: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  label: Schema.String,
});
