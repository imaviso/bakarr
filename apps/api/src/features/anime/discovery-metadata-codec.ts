import { Schema } from "effect";

import {
  type AnimeDiscoveryEntry,
  AnimeDiscoveryEntrySchema,
  StringListSchema,
} from "../../../../../packages/shared/src/index.ts";

const AnimeDiscoveryEntryListJsonSchema = Schema.parseJson(
  Schema.mutable(Schema.Array(AnimeDiscoveryEntrySchema)),
);
const AnimeSynonymsJsonSchema = Schema.parseJson(StringListSchema);

export function encodeAnimeDiscoveryEntries(
  entries: ReadonlyArray<AnimeDiscoveryEntry> | undefined,
): string | null {
  if (!entries || entries.length === 0) {
    return null;
  }

  return Schema.encodeSync(AnimeDiscoveryEntryListJsonSchema)(
    entries.map((entry) => ({
      ...entry,
      title: { ...entry.title },
    })),
  );
}

export function encodeAnimeSynonyms(synonyms: ReadonlyArray<string> | undefined): string | null {
  if (!synonyms || synonyms.length === 0) {
    return null;
  }

  return Schema.encodeSync(AnimeSynonymsJsonSchema)([...synonyms]);
}
