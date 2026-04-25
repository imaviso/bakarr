import { Schema } from "effect";

export const PositiveIntSchema = Schema.Number.pipe(Schema.int(), Schema.greaterThan(0));

export const PositiveIntFromStringSchema = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThan(0),
);

export const NonNegativeIntFromStringSchema = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.nonNegative(),
);

export const AnimeIdSchema = PositiveIntSchema.pipe(Schema.brand("AnimeId"));
export const AnimeIdFromStringSchema = PositiveIntFromStringSchema.pipe(Schema.brand("AnimeId"));

export const DownloadIdSchema = PositiveIntSchema.pipe(Schema.brand("DownloadId"));
export const DownloadIdFromStringSchema = PositiveIntFromStringSchema.pipe(
  Schema.brand("DownloadId"),
);

export const EpisodeNumberSchema = PositiveIntSchema.pipe(Schema.brand("EpisodeNumber"));
export const EpisodeNumberFromStringSchema = PositiveIntFromStringSchema.pipe(
  Schema.brand("EpisodeNumber"),
);

export const ReleaseProfileIdSchema = PositiveIntSchema.pipe(Schema.brand("ReleaseProfileId"));
