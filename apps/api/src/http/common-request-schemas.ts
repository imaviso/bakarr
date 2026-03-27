import { Schema } from "effect";

import {
  AnimeIdFromStringSchema,
  EpisodeNumberFromStringSchema,
  PositiveIntFromStringSchema,
} from "../lib/domain-schema.ts";

export const FilesystemPathStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.filter((value) => !value.includes("\u0000")),
);

export const AbsoluteFilesystemPathStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.filter((value) => value.startsWith("/") && !value.includes("\u0000")),
);

export const HttpUrlStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^https?:\/\/[^\s]+$/),
);

export const IsoDateTimeStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/),
);

export class IdParamsSchema extends Schema.Class<IdParamsSchema>("IdParamsSchema")({
  id: PositiveIntFromStringSchema,
}) {}

export class SearchEpisodeParamsSchema extends Schema.Class<SearchEpisodeParamsSchema>(
  "SearchEpisodeParamsSchema",
)({
  animeId: AnimeIdFromStringSchema,
  episodeNumber: EpisodeNumberFromStringSchema,
}) {}
