import { Effect, Schema } from "effect";
import { AnimeDiscoveryEntrySchema } from "@packages/shared/index.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";

const AnimeDiscoveryEntryListJsonSchema = Schema.parseJson(Schema.Array(AnimeDiscoveryEntrySchema));
const AnimeSynonymsJsonSchema = Schema.parseJson(Schema.Array(Schema.String));
const StringListJsonSchema = Schema.parseJson(Schema.Array(Schema.String));
const NumberListJsonSchema = Schema.parseJson(Schema.Array(Schema.Number));

export const decodeStoredStringListEffect = Effect.fn(
  "AnimeDecodeSupport.decodeStoredStringListEffect",
)(function* (value: string | null, field: string) {
  if (!value) {
    return [];
  }

  return yield* Schema.decodeUnknown(StringListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: `Stored anime ${field} JSON is corrupt`,
        }),
    ),
  );
});

export const decodeStoredNumberListEffect = Effect.fn(
  "AnimeDecodeSupport.decodeStoredNumberListEffect",
)(function* (value: string | null, field: string) {
  if (!value) {
    return [];
  }

  return yield* Schema.decodeUnknown(NumberListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: `Stored anime ${field} JSON is corrupt`,
        }),
    ),
  );
});

export const decodeStoredDiscoveryEntriesEffect = Effect.fn(
  "AnimeDecodeSupport.decodeStoredDiscoveryEntriesEffect",
)(function* (value: string | null, field: string) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(AnimeDiscoveryEntryListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: `Stored anime ${field} JSON is corrupt`,
        }),
    ),
  );
});

export const decodeStoredSynonymsEffect = Effect.fn(
  "AnimeDecodeSupport.decodeStoredSynonymsEffect",
)(function* (value: string | null) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(AnimeSynonymsJsonSchema)(value).pipe(
    Effect.map((decoded) => {
      const filtered = decoded.filter((entry) => entry.length > 0);
      return filtered.length > 0 ? filtered : undefined;
    }),
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: "Stored anime synonyms JSON is corrupt",
        }),
    ),
  );
});
