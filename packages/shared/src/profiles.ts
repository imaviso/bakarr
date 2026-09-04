// Shared quality and release profile wire contracts.
import { Schema } from "effect";
import { Struct } from "effect";
import { QualityIdSchema, type QualityId, ReleaseProfileIdSchema, RuleTypeSchema } from "./ids.ts";

export interface Quality {
  id: QualityId;
  name: string;
  source: string;
  resolution: number;
  rank: number;
}

export const QualitySchema = Schema.Struct({
  id: QualityIdSchema,
  name: Schema.String,
  source: Schema.String,
  resolution: Schema.Number,
  rank: Schema.Number,
});

export const QualityProfileSchema = Schema.Struct({
  cutoff: Schema.String,
  upgrade_allowed: Schema.Boolean,
  seadex_preferred: Schema.Boolean,
  allowed_qualities: Schema.mutable(Schema.Array(Schema.String)),
  name: Schema.String,
  min_size: Schema.optional(Schema.NullOr(Schema.String)),
  max_size: Schema.optional(Schema.NullOr(Schema.String)),
}).mapFields(Struct.map(Schema.mutableKey));

export type QualityProfile = Schema.Schema.Type<typeof QualityProfileSchema>;

export const ReleaseProfileRuleSchema = Schema.Struct({
  term: Schema.String,
  score: Schema.Number,
  rule_type: RuleTypeSchema,
});

export type ReleaseProfileRule = Schema.Schema.Type<typeof ReleaseProfileRuleSchema>;

export const ReleaseProfileSchema = Schema.Struct({
  id: ReleaseProfileIdSchema,
  name: Schema.String,
  enabled: Schema.Boolean,
  is_global: Schema.Boolean,
  rules: Schema.mutable(Schema.Array(ReleaseProfileRuleSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export type ReleaseProfile = Schema.Schema.Type<typeof ReleaseProfileSchema>;
