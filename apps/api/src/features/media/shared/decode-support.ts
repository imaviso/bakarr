import { Effect, Schema } from "effect";
import { MediaDiscoveryEntrySchema } from "@packages/shared/index.ts";
import { StoredDataError } from "@/features/errors.ts";

const AnimeDiscoveryEntryListJsonSchema = Schema.fromJsonString(
  Schema.Array(MediaDiscoveryEntrySchema),
);
const AnimeSynonymsJsonSchema = Schema.fromJsonString(Schema.Array(Schema.String));
const StringListJsonSchema = Schema.fromJsonString(Schema.Array(Schema.String));
const NumberListJsonSchema = Schema.fromJsonString(Schema.Array(Schema.Number));

export const decodeStoredStringListEffect = Effect.fn(
  "MediaDecodeSupport.decodeStoredStringListEffect",
)(function* (value: string | null, field: string) {
  if (!value) {
    return [];
  }

  return yield* Schema.decodeUnknownEffect(StringListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: `Stored media ${field} JSON is corrupt`,
        }),
    ),
  );
});

export const decodeStoredNumberListEffect = Effect.fn(
  "MediaDecodeSupport.decodeStoredNumberListEffect",
)(function* (value: string | null, field: string) {
  if (!value) {
    return [];
  }

  return yield* Schema.decodeUnknownEffect(NumberListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: `Stored media ${field} JSON is corrupt`,
        }),
    ),
  );
});

export const decodeStoredDiscoveryEntriesEffect = Effect.fn(
  "MediaDecodeSupport.decodeStoredDiscoveryEntriesEffect",
)(function* (value: string | null, field: string) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknownEffect(AnimeDiscoveryEntryListJsonSchema)(value).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: `Stored media ${field} JSON is corrupt`,
        }),
    ),
  );
});

export const decodeStoredSynonymsEffect = Effect.fn(
  "MediaDecodeSupport.decodeStoredSynonymsEffect",
)(function* (value: string | null) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknownEffect(AnimeSynonymsJsonSchema)(value).pipe(
    Effect.map((decoded) => {
      const filtered = decoded.filter((entry) => entry.length > 0);
      return filtered.length > 0 ? filtered : undefined;
    }),
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Stored media synonyms JSON is corrupt",
        }),
    ),
  );
});
