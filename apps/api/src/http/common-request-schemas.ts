import { Schema } from "effect";

import {
  AnimeIdFromStringSchema,
  EpisodeNumberFromStringSchema,
  PositiveIntFromStringSchema,
} from "../lib/domain-schema.ts";

export class IdParamsSchema extends Schema.Class<IdParamsSchema>("IdParamsSchema")({
  id: PositiveIntFromStringSchema,
}) {}

export class SearchEpisodeParamsSchema extends Schema.Class<SearchEpisodeParamsSchema>(
  "SearchEpisodeParamsSchema",
)({
  animeId: AnimeIdFromStringSchema,
  episodeNumber: EpisodeNumberFromStringSchema,
}) {}
