import { Effect, Schema } from "effect";

import {
  type AnimeDiscoveryEntry,
  AnimeDiscoveryEntrySchema,
  StringListSchema,
} from "@packages/shared/index.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";

const AnimeDiscoveryEntryListJsonSchema = Schema.parseJson(
  Schema.mutable(Schema.Array(AnimeDiscoveryEntrySchema)),
);
const AnimeSynonymsJsonSchema = Schema.parseJson(StringListSchema);

export function encodeAnimeDiscoveryEntries(
  entries: ReadonlyArray<AnimeDiscoveryEntry> | undefined,
): Effect.Effect<string | null, AnimeStoredDataError> {
  if (!entries || entries.length === 0) {
    return Effect.succeed(null);
  }

  return Schema.encode(AnimeDiscoveryEntryListJsonSchema)(
    entries.map((entry) => ({
      ...entry,
      title: { ...entry.title },
    })),
  ).pipe(
    Effect.mapError(
      (cause) =>
        new AnimeStoredDataError({
          cause,
          message: "Anime discovery metadata is invalid",
        }),
    ),
  );
}

export function encodeAnimeSynonyms(
  synonyms: ReadonlyArray<string> | undefined,
): Effect.Effect<string | null, AnimeStoredDataError> {
  if (!synonyms || synonyms.length === 0) {
    return Effect.succeed(null);
  }

  return Schema.encode(AnimeSynonymsJsonSchema)([...synonyms]).pipe(
    Effect.mapError(
      (cause) =>
        new AnimeStoredDataError({
          cause,
          message: "Anime synonyms metadata is invalid",
        }),
    ),
  );
}
