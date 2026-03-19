import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type {
  CalendarEvent,
  MissingEpisode,
  RenamePreviewItem,
} from "../../../../../packages/shared/src/index.ts";
import { DatabaseError } from "../../db/database.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import { deriveEpisodeTimelineMetadata } from "../anime/query-support.ts";
import type { OperationsError } from "./errors.ts";
import { buildRenamePreview } from "./library-import.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";

export interface CatalogLibraryReadSupportShape {
  readonly getWantedMissing: (
    limit: number,
  ) => Effect.Effect<MissingEpisode[], DatabaseError>;
  readonly getCalendar: (
    start: string,
    end: string,
  ) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly getRenamePreview: (
    animeId: number,
  ) => Effect.Effect<RenamePreviewItem[], OperationsError | DatabaseError>;
}

export function makeCatalogLibraryReadSupport(input: {
  db: AppDatabase;
  tryDatabasePromise: TryDatabasePromise;
  tryOperationsPromise: TryOperationsPromise;
}): CatalogLibraryReadSupportShape {
  const getWantedMissing = Effect.fn("OperationsService.getWantedMissing")(
    function* (limit: number) {
      const rows = yield* input.tryDatabasePromise(
        "Failed to load wanted episodes",
        () =>
          input.db.select({
            animeId: anime.id,
            animeTitle: anime.titleRomaji,
            coverImage: anime.coverImage,
            nextAiringAt: anime.nextAiringAt,
            nextAiringEpisode: anime.nextAiringEpisode,
            episodeNumber: episodes.number,
            title: episodes.title,
            aired: episodes.aired,
          }).from(episodes).innerJoin(anime, eq(anime.id, episodes.animeId))
            .where(
              and(
                eq(anime.monitored, true),
                eq(episodes.downloaded, false),
                sql`${episodes.aired} is not null`,
                sql`${episodes.aired} <= ${new Date().toISOString()}`,
              ),
            ).orderBy(episodes.aired, anime.titleRomaji).limit(
              Math.max(1, limit),
            ),
      );

      return rows.map((row) => {
        const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined);

        return {
          aired: row.aired ?? undefined,
          airing_status: timeline.airing_status,
          anime_id: row.animeId,
          anime_image: row.coverImage ?? undefined,
          anime_title: row.animeTitle,
          episode_number: row.episodeNumber,
          episode_title: row.title ?? undefined,
          is_future: timeline.is_future,
          next_airing_episode: row.nextAiringAt && row.nextAiringEpisode
            ? {
              airing_at: row.nextAiringAt,
              episode: row.nextAiringEpisode,
            }
            : undefined,
        } satisfies MissingEpisode;
      });
    },
  );

  const getCalendar = Effect.fn("OperationsService.getCalendar")(
    function* (start: string, end: string) {
      const rows = yield* input.tryDatabasePromise(
        "Failed to load calendar events",
        () =>
          input.db.select().from(episodes).innerJoin(
            anime,
            eq(anime.id, episodes.animeId),
          ).where(
            and(
              sql`${episodes.aired} >= ${start}`,
              sql`${episodes.aired} <= ${end}`,
            ),
          ).orderBy(episodes.aired, anime.titleRomaji),
      );

      return rows.map(({ anime: animeRow, episodes: episodeRow }) => {
        const timeline = deriveEpisodeTimelineMetadata(
          episodeRow.aired ?? undefined,
        );

        return {
          all_day: isAllDayAiring(episodeRow.aired),
          end: episodeRow.aired ?? new Date().toISOString(),
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
          start: episodeRow.aired ?? new Date().toISOString(),
          title: buildCalendarEventTitle(animeRow.titleRomaji, episodeRow),
        } satisfies CalendarEvent;
      });
    },
  );

  const getRenamePreview = Effect.fn("OperationsService.getRenamePreview")(
    function* (animeId: number) {
      return yield* input.tryOperationsPromise(
        "Failed to build rename preview",
        () => buildRenamePreview(input.db, animeId),
      );
    },
  );

  return {
    getCalendar,
    getRenamePreview,
    getWantedMissing,
  };
}

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
