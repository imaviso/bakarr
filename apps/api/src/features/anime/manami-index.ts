import type { ManamiAnimeEntry, ManamiDataset } from "@/features/anime/manami-model.ts";
import { parseAniListIdFromSource, parseMalIdFromSource } from "@/features/anime/manami-url.ts";

export interface ManamiIndexes {
  readonly aniListIdByMalId: Map<number, number>;
  readonly byAniListId: Map<number, ManamiAnimeEntry>;
  readonly malOnlyByMalId: Map<number, ManamiAnimeEntry>;
  readonly malIdByAniListId: Map<number, number>;
}

export function buildManamiIndexes(dataset: ManamiDataset): ManamiIndexes {
  const byAniListId = new Map<number, ManamiAnimeEntry>();
  const malOnlyByMalId = new Map<number, ManamiAnimeEntry>();
  const malIdByAniListId = new Map<number, number>();
  const aniListIdByMalId = new Map<number, number>();

  for (const entry of dataset.data) {
    const aniListId = firstParsedId(entry.sources, parseAniListIdFromSource);
    const malId = firstParsedId(entry.sources, parseMalIdFromSource);

    if (aniListId !== undefined && !byAniListId.has(aniListId)) {
      byAniListId.set(aniListId, entry);
    }

    if (aniListId === undefined && malId !== undefined && !malOnlyByMalId.has(malId)) {
      malOnlyByMalId.set(malId, entry);
    }

    if (aniListId !== undefined && malId !== undefined) {
      if (!malIdByAniListId.has(aniListId)) {
        malIdByAniListId.set(aniListId, malId);
      }

      if (!aniListIdByMalId.has(malId)) {
        aniListIdByMalId.set(malId, aniListId);
      }
    }
  }

  return {
    aniListIdByMalId,
    byAniListId,
    malOnlyByMalId,
    malIdByAniListId,
  };
}

function firstParsedId(
  sources: ReadonlyArray<string>,
  parse: (source: string) => number | undefined,
): number | undefined {
  for (const source of sources) {
    const parsed = parse(source);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}
