import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import {
  clampInferredEpisodeUpperBound,
  MAX_INFERRED_EPISODE_NUMBER,
} from "@/features/media/units/unit-backfill-policy.ts";
import { inferAiredAt } from "@/domain/media/derivations.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const backfillEpisodesFromNextAiringEffect = Effect.fn(
  "AnimeEpisodeBackfill.backfillFromNextAiring",
)(function* (input: {
  readonly mediaId?: number;
  readonly db: AppDatabase;
  readonly monitoredOnly: boolean;
}) {
  const whereClause = and(
    input.mediaId === undefined ? undefined : eq(media.id, input.mediaId),
    input.monitoredOnly ? eq(media.monitored, true) : undefined,
    isNull(media.unitCount),
    isNotNull(media.nextAiringUnit),
    isNotNull(media.nextAiringAt),
    sql`${media.nextAiringUnit} > 1`,
  );

  const candidates = yield* tryDatabasePromise(
    "Failed to load next-airing backfill candidates",
    () =>
      input.db
        .select({
          id: media.id,
          nextAiringAt: media.nextAiringAt,
          nextAiringUnit: media.nextAiringUnit,
        })
        .from(media)
        .where(whereClause),
  );

  if (candidates.length === 0) {
    return;
  }

  const candidateIds = candidates.map((candidate) => candidate.id);
  const existingRows = yield* tryDatabasePromise(
    "Failed to load existing mediaUnits for backfill",
    () =>
      input.db
        .select({
          mediaId: mediaUnits.mediaId,
          number: mediaUnits.number,
        })
        .from(mediaUnits)
        .where(
          and(
            inArray(mediaUnits.mediaId, candidateIds),
            gte(mediaUnits.number, 1),
            lte(mediaUnits.number, MAX_INFERRED_EPISODE_NUMBER),
          ),
        ),
  );

  const existingByAnimeId = new Map<number, Set<number>>();

  for (const row of existingRows) {
    const numbers = existingByAnimeId.get(row.mediaId);

    if (numbers) {
      numbers.add(row.number);
      continue;
    }

    existingByAnimeId.set(row.mediaId, new Set([row.number]));
  }

  const rowsToInsert: (typeof mediaUnits.$inferInsert)[] = [];

  for (const candidate of candidates) {
    const nextAiringUnit = candidate.nextAiringUnit;
    const nextAiringAt = candidate.nextAiringAt;

    if (!nextAiringUnit || !nextAiringAt) {
      continue;
    }

    const upperBound = clampInferredEpisodeUpperBound(nextAiringUnit - 1);

    if (upperBound === undefined) {
      continue;
    }

    const existingNumbers = existingByAnimeId.get(candidate.id) ?? new Set<number>();
    const scheduleMap = new Map<number, string>([[nextAiringUnit, nextAiringAt]]);

    const missingRows = range(1, upperBound).flatMap((unitNumber) => {
      if (existingNumbers.has(unitNumber)) {
        return [];
      }

      const aired = inferAiredAt(
        "RELEASING",
        unitNumber,
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
          mediaId: candidate.id,
          downloaded: false,
          filePath: null,
          number: unitNumber,
          title: null,
        } satisfies typeof mediaUnits.$inferInsert,
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

  yield* tryDatabasePromise("Failed to backfill mediaUnits from next airing", () =>
    input.db.insert(mediaUnits).values(rowsToInsert).onConflictDoNothing(),
  );
});

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
