import { and, eq, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { CalendarEvent, MissingEpisode, RenamePreviewItem } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { buildRenamePreview } from "@/features/operations/library-import.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { deriveEpisodeTimelineMetadata } from "@/lib/anime-derivations.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export interface CatalogLibraryReadServiceShape {
  readonly getWantedMissing: (limit: number) => Effect.Effect<MissingEpisode[], DatabaseError>;
  readonly getCalendarWithDefaults: (input: {
    readonly start?: string;
    readonly end?: string;
  }) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly getCalendar: (
    start: string,
    end: string,
  ) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly getRenamePreview: (
    animeId: number,
  ) => Effect.Effect<RenamePreviewItem[], OperationsError | DatabaseError>;
}

export class CatalogLibraryReadService extends Context.Tag("@bakarr/api/CatalogLibraryReadService")<
  CatalogLibraryReadService,
  CatalogLibraryReadServiceShape
>() {}

export const CatalogLibraryReadServiceLive = Layer.effect(
  CatalogLibraryReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const nowIso = () => nowIsoFromClock(clock);

    const getWantedMissing = Effect.fn("OperationsService.getWantedMissing")(function* (
      limit: number,
    ) {
      const now = new Date(yield* nowIso()).toISOString();
      const rows = yield* tryDatabasePromise("Failed to load wanted episodes", () =>
        db
          .select({
            animeId: anime.id,
            animeTitle: anime.titleRomaji,
            coverImage: anime.coverImage,
            nextAiringAt: anime.nextAiringAt,
            nextAiringEpisode: anime.nextAiringEpisode,
            episodeNumber: episodes.number,
            title: episodes.title,
            aired: episodes.aired,
          })
          .from(episodes)
          .innerJoin(anime, eq(anime.id, episodes.animeId))
          .where(
            and(
              eq(anime.monitored, true),
              eq(episodes.downloaded, false),
              sql`${episodes.aired} is not null`,
              sql`${episodes.aired} <= ${now}`,
            ),
          )
          .orderBy(episodes.aired, anime.titleRomaji)
          .limit(Math.max(1, limit)),
      );

      return rows.map((row) => {
        const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined, new Date(now));

        return {
          aired: row.aired ?? undefined,
          airing_status: timeline.airing_status,
          anime_id: row.animeId,
          anime_image: row.coverImage ?? undefined,
          anime_title: row.animeTitle,
          episode_number: row.episodeNumber,
          episode_title: row.title ?? undefined,
          is_future: timeline.is_future,
          next_airing_episode:
            row.nextAiringAt && row.nextAiringEpisode
              ? {
                  airing_at: row.nextAiringAt,
                  episode: row.nextAiringEpisode,
                }
              : undefined,
        } satisfies MissingEpisode;
      });
    });

    const getCalendar = Effect.fn("OperationsService.getCalendar")(function* (
      start: string,
      end: string,
    ) {
      const now = new Date(yield* nowIso());
      const nowIsoValue = now.toISOString();
      const rows = yield* tryDatabasePromise("Failed to load calendar events", () =>
        db
          .select()
          .from(episodes)
          .innerJoin(anime, eq(anime.id, episodes.animeId))
          .where(and(sql`${episodes.aired} >= ${start}`, sql`${episodes.aired} <= ${end}`))
          .orderBy(episodes.aired, anime.titleRomaji),
      );

      return rows.map(({ anime: animeRow, episodes: episodeRow }) => {
        const timeline = deriveEpisodeTimelineMetadata(episodeRow.aired ?? undefined, now);

        return {
          all_day: isAllDayAiring(episodeRow.aired),
          end: episodeRow.aired ?? nowIsoValue,
          extended_props: {
            airing_status: timeline.airing_status,
            anime_id: animeRow.id,
            anime_image: animeRow.coverImage ?? undefined,
            anime_title: animeRow.titleRomaji,
            downloaded: episodeRow.downloaded,
            episode_number: episodeRow.number,
            episode_title: episodeRow.title ?? undefined,
            is_future: timeline.is_future,
          },
          id: `${animeRow.id}-${episodeRow.number}`,
          start: episodeRow.aired ?? nowIsoValue,
          title: buildCalendarEventTitle(animeRow.titleRomaji, episodeRow),
        } satisfies CalendarEvent;
      });
    });

    const getCalendarWithDefaults = Effect.fn("OperationsService.getCalendarWithDefaults")(
      function* (input: { readonly start?: string; readonly end?: string }) {
        const nowIsoValue = yield* nowIso();
        return yield* getCalendar(input.start ?? nowIsoValue, input.end ?? nowIsoValue);
      },
    );

    const getRenamePreview = Effect.fn("OperationsService.getRenamePreview")(function* (
      animeId: number,
    ) {
      return yield* buildRenamePreview(db, animeId);
    });

    return CatalogLibraryReadService.of({
      getCalendar,
      getCalendarWithDefaults,
      getRenamePreview,
      getWantedMissing,
    });
  }),
);

function isAllDayAiring(aired?: string | null) {
  return !aired?.includes("T");
}

function buildCalendarEventTitle(
  animeTitle: string,
  episodeRow: { number: number; title: string | null },
) {
  return episodeRow.title
    ? `${animeTitle} - Episode ${episodeRow.number}: ${episodeRow.title}`
    : `${animeTitle} - Episode ${episodeRow.number}`;
}
