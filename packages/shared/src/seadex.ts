// Shared SeaDex wire contracts for the anime media page.
import { Schema } from "effect";

export interface SeaDexRelease {
  dualAudio: boolean;
  groupedUrl: string;
  infoHash?: string | undefined | null;
  isBest: boolean;
  releaseGroup: string;
  tags: string[];
  tracker: string;
  url: string;
}

export const SeaDexReleaseSchema = Schema.Struct({
  dualAudio: Schema.Boolean,
  groupedUrl: Schema.String,
  infoHash: Schema.optional(Schema.NullishOr(Schema.String)),
  isBest: Schema.Boolean,
  releaseGroup: Schema.String,
  tags: Schema.mutable(Schema.Array(Schema.String)),
  tracker: Schema.String,
  url: Schema.String,
});

export interface SeaDexEntry {
  alID: number;
  comparison?: string | undefined | null;
  incomplete: boolean;
  notes?: string | undefined | null;
  releases: SeaDexRelease[];
}

export const SeaDexEntrySchema = Schema.Struct({
  alID: Schema.Number,
  comparison: Schema.optional(Schema.NullishOr(Schema.String)),
  incomplete: Schema.Boolean,
  notes: Schema.optional(Schema.NullishOr(Schema.String)),
  releases: Schema.mutable(Schema.Array(SeaDexReleaseSchema)),
});

export const SeaDexEntryNullableSchema = Schema.NullOr(SeaDexEntrySchema);
