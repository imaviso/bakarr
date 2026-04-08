import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import {
  clampInferredEpisodeUpperBound,
  MAX_INFERRED_EPISODE_NUMBER,
} from "@/features/anime/episode-backfill-policy.ts";
import { inferAiredAt } from "@/lib/anime-derivations.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const backfillEpisodesFromNextAiringEffect = Effect.fn(
  "AnimeEpisodeBackfill.backfillFromNextAiring",
)(function* (input: {
  readonly animeId?: number;
  readonly db: AppDatabase;
  readonly monitoredOnly: boolean;
}) {
  const whereClause = and(
    input.animeId === undefined ? undefined : eq(anime.id, input.animeId),
    input.monitoredOnly ? eq(anime.monitored, true) : undefined,
    isNull(anime.episodeCount),
    isNotNull(anime.nextAiringEpisode),
    isNotNull(anime.nextAiringAt),
    sql`${anime.nextAiringEpisode} > 1`,
  );

  const candidates = yield* tryDatabasePromise("Failed to load next-airing backfill candidates", () =>
    input.db
      .select({
        id: anime.id,
        nextAiringAt: anime.nextAiringAt,
        nextAiringEpisode: anime.nextAiringEpisode,
      })
      .from(anime)
      .where(whereClause),
  );

  if (candidates.length === 0) {
    return;
  }

  const candidateIds = candidates.map((candidate) => candidate.id);
  const existingRows = yield* tryDatabasePromise("Failed to load existing episodes for backfill", () =>
    input.db
      .select({
        animeId: episodes.animeId,
        number: episodes.number,
      })
      .from(episodes)
      .where(
        and(
          inArray(episodes.animeId, candidateIds),
          gte(episodes.number, 1),
          lte(episodes.number, MAX_INFERRED_EPISODE_NUMBER),
        ),
      ),
  );

  const existingByAnimeId = new Map<number, Set<number>>();

  for (const row of existingRows) {
    const numbers = existingByAnimeId.get(row.animeId);

    if (numbers) {
      numbers.add(row.number);
      continue;
    }

    existingByAnimeId.set(row.animeId, new Set([row.number]));
  }

  const rowsToInsert: (typeof episodes.$inferInsert)[] = [];

  for (const candidate of candidates) {
    const nextAiringEpisode = candidate.nextAiringEpisode;
    const nextAiringAt = candidate.nextAiringAt;

    if (!nextAiringEpisode || !nextAiringAt) {
      continue;
    }

    const upperBound = clampInferredEpisodeUpperBound(nextAiringEpisode - 1);

    if (upperBound === undefined) {
      continue;
    }

    const existingNumbers = existingByAnimeId.get(candidate.id) ?? new Set<number>();
    const scheduleMap = new Map<number, string>([[nextAiringEpisode, nextAiringAt]]);

    const missingRows = range(1, upperBound).flatMap((episodeNumber) => {
      if (existingNumbers.has(episodeNumber)) {
        return [];
      }

      const aired = inferAiredAt(
        "RELEASING",
        episodeNumber,
        undefined,
        undefined,
        undefined,
        scheduleMap,
      );

      if (aired === null) {
        return [];
      }

      return [
        {
          aired,
          animeId: candidate.id,
          downloaded: false,
          filePath: null,
          number: episodeNumber,
          title: null,
        } satisfies typeof episodes.$inferInsert,
      ];
    });

    if (missingRows.length === 0) {
      continue;
    }

    rowsToInsert.push(...missingRows);
  }

  if (rowsToInsert.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to backfill episodes from next airing", () =>
    input.db.insert(episodes).values(rowsToInsert).onConflictDoNothing(),
  );
});

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
