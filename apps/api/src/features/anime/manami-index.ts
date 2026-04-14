import type { ManamiAnimeEntry, ManamiDataset } from "@/features/anime/manami-model.ts";
import { parseAniListIdFromSource, parseMalIdFromSource } from "@/features/anime/manami-url.ts";

export interface ManamiIndexes {
  readonly aniListIdByMalId: Map<number, number>;
  readonly byAniListId: Map<number, ManamiAnimeEntry>;
  readonly byMalId: Map<number, ManamiAnimeEntry>;
  readonly malIdByAniListId: Map<number, number>;
}

export function buildManamiIndexes(dataset: ManamiDataset): ManamiIndexes {
  const byAniListId = new Map<number, ManamiAnimeEntry>();
  const byMalId = new Map<number, ManamiAnimeEntry>();
  const malIdByAniListId = new Map<number, number>();
  const aniListIdByMalId = new Map<number, number>();

  for (const entry of dataset.data) {
    const aniListId = firstParsedId(entry.sources, parseAniListIdFromSource);
    const malId = firstParsedId(entry.sources, parseMalIdFromSource);

    if (aniListId !== undefined && !byAniListId.has(aniListId)) {
      byAniListId.set(aniListId, entry);
    }

    if (malId !== undefined && !byMalId.has(malId)) {
      byMalId.set(malId, entry);
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
    byMalId,
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
