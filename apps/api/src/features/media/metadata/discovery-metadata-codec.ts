import { Effect, Schema } from "effect";

import {
  type MediaDiscoveryEntry,
  MediaDiscoveryEntrySchema,
  StringListSchema,
} from "@packages/shared/index.ts";
import { StoredDataError } from "@/features/errors.ts";

const AnimeDiscoveryEntryListJsonSchema = Schema.parseJson(
  Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema)),
);
const AnimeSynonymsJsonSchema = Schema.parseJson(StringListSchema);

export function encodeAnimeDiscoveryEntries(
  entries: ReadonlyArray<MediaDiscoveryEntry> | undefined,
): Effect.Effect<string | null, StoredDataError> {
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
        new StoredDataError({
          cause,
          message: "Media discovery metadata is invalid",
        }),
    ),
  );
}

export function encodeAnimeSynonyms(
  synonyms: ReadonlyArray<string> | undefined,
): Effect.Effect<string | null, StoredDataError> {
  if (!synonyms || synonyms.length === 0) {
    return Effect.succeed(null);
  }

  return Schema.encode(AnimeSynonymsJsonSchema)([...synonyms]).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Media synonyms metadata is invalid",
        }),
    ),
  );
}
