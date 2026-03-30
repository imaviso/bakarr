import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import { inferAiredAt } from "@/lib/anime-derivations.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export interface FutureAiringScheduleEntry {
  readonly airingAt: string;
  readonly episode: number;
}

export const buildAiringScheduleMap = (
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
) => new Map((futureAiringSchedule ?? []).map((entry) => [entry.episode, entry.airingAt]));

export const ensureEpisodesEffect = Effect.fn("AnimeRepository.ensureEpisodes")(function* (
  db: AppDatabase,
  animeId: number,
  episodeCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  resetMissingOnly: boolean,
  nowIso: () => Effect.Effect<string>,
) {
  const now = yield* nowIso();
  const existingRows =
    !episodeCount || episodeCount <= 0
      ? []
      : yield* tryDatabasePromise("Failed to ensure episodes", () =>
          db.select().from(episodes).where(eq(episodes.animeId, animeId)),
        );
  const missingRows = buildMissingEpisodeRows({
    animeId,
    episodeCount,
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

  yield* tryDatabasePromise("Failed to ensure episodes", () =>
    db.insert(episodes).values(missingRows),
  );
});

export const updateAnimeEpisodeAirDatesEffect = Effect.fn(
  "AnimeRepository.updateAnimeEpisodeAirDates",
)(function* (
  db: AppDatabase,
  animeId: number,
  episodeCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  nowIso: () => Effect.Effect<string>,
) {
  if (!episodeCount || episodeCount <= 0) {
    return;
  }

  const existingRows = yield* tryDatabasePromise("Failed to update anime episode air dates", () =>
    db.select().from(episodes).where(eq(episodes.animeId, animeId)),
  );
  const scheduleMap = buildAiringScheduleMap(futureAiringSchedule);
  const now = yield* nowIso();

  for (const row of existingRows) {
    const inferred = inferAiredAt(
      status,
      row.number,
      episodeCount,
      startDate,
      endDate,
      scheduleMap,
      now,
    );

    if (row.aired === inferred) {
      continue;
    }

    yield* tryDatabasePromise("Failed to update anime episode air dates", () =>
      db.update(episodes).set({ aired: inferred }).where(eq(episodes.id, row.id)),
    );
  }
});

export function buildMissingEpisodeRows(input: {
  animeId: number;
  episodeCount: number | undefined;
  status: string;
  startDate: string | undefined;
  endDate: string | undefined;
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined;
  nowIso?: string;
  resetMissingOnly: boolean;
  existingRows: readonly (typeof episodes.$inferSelect)[];
}) {
  if (!input.episodeCount || input.episodeCount <= 0) {
    return [] as (typeof episodes.$inferInsert)[];
  }

  const existingByNumber = new Map(input.existingRows.map((row) => [row.number, row]));
  const airingScheduleByEpisode = buildAiringScheduleMap(input.futureAiringSchedule);

  return range(1, input.episodeCount).flatMap((number) => {
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
          input.episodeCount,
          input.startDate,
          input.endDate,
          airingScheduleByEpisode,
          input.nowIso,
        ),
        animeId: input.animeId,
        downloaded: false,
        filePath: null,
        number,
        title: null,
      } satisfies typeof episodes.$inferInsert,
    ];
  });
}

export { inferAiredAt };

function range(start: number, end: number) {
  return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index);
}
