import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { mediaUnits } from "@/db/schema.ts";
import { clampInferredEpisodeUpperBound } from "@/features/media/units/unit-backfill-policy.ts";
import { inferAiredAt } from "@/domain/media/derivations.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface FutureAiringScheduleEntry {
  readonly airingAt: string;
  readonly episode: number;
}

export const buildAiringScheduleMap = (
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
) => new Map((futureAiringSchedule ?? []).map((entry) => [entry.episode, entry.airingAt]));

export const ensureEpisodesEffect = Effect.fn("AnimeRepository.ensureEpisodes")(function* <E>(
  db: AppDatabase,
  mediaId: number,
  unitCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  resetMissingOnly: boolean,
  nowIso: () => Effect.Effect<string, E>,
) {
  const now = yield* nowIso();
  const hasFutureSchedule = Array.isArray(futureAiringSchedule) && futureAiringSchedule.length > 0;
  const existingRows =
    (!unitCount || unitCount <= 0) && !hasFutureSchedule
      ? []
      : yield* tryDatabasePromise("Failed to ensure mediaUnits", () =>
          db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)),
        );
  const missingRows = buildMissingEpisodeRows({
    mediaId,
    unitCount,
    endDate,
    existingRows,
    futureAiringSchedule,
    nowIso: now,
    resetMissingOnly,
    startDate,
    status,
  });

  if (missingRows.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to ensure mediaUnits", () =>
    db.insert(mediaUnits).values(missingRows),
  );
});

export const updateAnimeEpisodeAirDatesEffect = Effect.fn(
  "AnimeRepository.updateAnimeEpisodeAirDates",
)(function* <E>(
  db: AppDatabase,
  mediaId: number,
  unitCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  nowIso: () => Effect.Effect<string, E>,
) {
  const scheduleMap = buildAiringScheduleMap(futureAiringSchedule);
  const maxScheduledEpisode = clampInferredEpisodeUpperBound(maxEpisodeNumber(scheduleMap));

  if ((!unitCount || unitCount <= 0) && scheduleMap.size === 0) {
    return;
  }

  const existingRows = yield* tryDatabasePromise("Failed to update media episode air dates", () =>
    db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)),
  );
  const now = yield* nowIso();

  for (const row of existingRows) {
    if (
      (!unitCount || unitCount <= 0) &&
      (maxScheduledEpisode === undefined || row.number > maxScheduledEpisode)
    ) {
      continue;
    }

    const inferred = inferAiredAt(
      status,
      row.number,
      unitCount,
      startDate,
      endDate,
      scheduleMap,
      now,
    );

    if (row.aired === inferred) {
      continue;
    }

    yield* tryDatabasePromise("Failed to update media episode air dates", () =>
      db.update(mediaUnits).set({ aired: inferred }).where(eq(mediaUnits.id, row.id)),
    );
  }
});

export function buildMissingEpisodeRows(input: {
  mediaId: number;
  unitCount: number | undefined;
  status: string;
  startDate: string | undefined;
  endDate: string | undefined;
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined;
  nowIso?: string;
  resetMissingOnly: boolean;
  existingRows: readonly (typeof mediaUnits.$inferSelect)[];
}) {
  const unitNumbers = resolveEpisodeNumbers(input.unitCount, input.futureAiringSchedule);

  if (unitNumbers.length === 0) {
    return [] as (typeof mediaUnits.$inferInsert)[];
  }

  const existingByNumber = new Map(input.existingRows.map((row) => [row.number, row]));
  const airingScheduleByEpisode = buildAiringScheduleMap(input.futureAiringSchedule);

  return unitNumbers.flatMap((number) => {
    const existing = existingByNumber.get(number);

    if (existing) {
      if (input.resetMissingOnly && existing.downloaded) {
        return [];
      }

      return [];
    }

    return [
      {
        aired: inferAiredAt(
          input.status,
          number,
          input.unitCount,
          input.startDate,
          input.endDate,
          airingScheduleByEpisode,
          input.nowIso,
        ),
        mediaId: input.mediaId,
        downloaded: false,
        filePath: null,
        number,
        title: null,
      } satisfies typeof mediaUnits.$inferInsert,
    ];
  });
}

function resolveEpisodeNumbers(
  unitCount: number | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
) {
  if (unitCount && unitCount > 0) {
    return range(1, unitCount);
  }

  if (!Array.isArray(futureAiringSchedule) || futureAiringSchedule.length === 0) {
    return [] as number[];
  }

  const scheduleEpisodeNumbers = [
    ...new Set(
      futureAiringSchedule
        .map((entry) => entry.episode)
        .filter((episode) => Number.isInteger(episode) && episode > 0),
    ),
  ].toSorted((left, right) => left - right);

  const maxScheduled = scheduleEpisodeNumbers[scheduleEpisodeNumbers.length - 1];
  const upperBound = clampInferredEpisodeUpperBound(maxScheduled);

  if (upperBound === undefined) {
    return [] as number[];
  }

  return range(1, upperBound);
}

function maxEpisodeNumber(scheduleMap: ReadonlyMap<number, string>) {
  let max: number | undefined;

  for (const unitNumber of scheduleMap.keys()) {
    if (max === undefined || unitNumber > max) {
      max = unitNumber;
    }
  }

  return max;
}

export { inferAiredAt };

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
