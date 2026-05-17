import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import {
  brandMediaId,
  type CalendarEvent,
  type MissingUnit,
  type RenamePreviewItem,
} from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { buildRenamePreview } from "@/features/operations/library/library-import.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { deriveEpisodeTimelineMetadata } from "@/domain/media/derivations.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";

export interface CatalogLibraryReadServiceShape {
  readonly getWantedMissing: (limit: number) => Effect.Effect<MissingUnit[], DatabaseError>;
  readonly getCalendarWithDefaults: (input: {
    readonly start?: string;
    readonly end?: string;
  }) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly getCalendar: (
    start: string,
    end: string,
  ) => Effect.Effect<CalendarEvent[], DatabaseError>;
  readonly getRenamePreview: (
    mediaId: number,
  ) => Effect.Effect<
    RenamePreviewItem[],
    OperationsError | DatabaseError | RuntimeConfigSnapshotError
  >;
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
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
    const nowIso = () => nowIsoFromClock(clock);

    const getWantedMissing = Effect.fn("OperationsService.getWantedMissing")(function* (
      limit: number,
    ) {
      const now = new Date(yield* nowIso()).toISOString();
      const rows = yield* tryDatabasePromise("Failed to load wanted mediaUnits", () =>
        db
          .select({
            mediaId: media.id,
            mediaTitle: media.titleRomaji,
            mediaKind: media.mediaKind,
            coverImage: media.coverImage,
            nextAiringAt: media.nextAiringAt,
            nextAiringUnit: media.nextAiringUnit,
            unitNumber: mediaUnits.number,
            title: mediaUnits.title,
            aired: mediaUnits.aired,
          })
          .from(mediaUnits)
          .innerJoin(media, eq(media.id, mediaUnits.mediaId))
          .where(
            and(
              eq(media.monitored, true),
              eq(mediaUnits.downloaded, false),
              or(
                and(
                  eq(media.mediaKind, "anime"),
                  sql`${mediaUnits.aired} is not null`,
                  sql`${mediaUnits.aired} <= ${now}`,
                ),
                ne(media.mediaKind, "anime"),
              ),
            ),
          )
          .orderBy(sql`${mediaUnits.aired} is null`, asc(mediaUnits.aired), media.titleRomaji)
          .limit(Math.max(1, limit)),
      );

      return rows.map((row) => {
        const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined, new Date(now));

        return {
          aired: row.aired ?? undefined,
          airing_status: timeline.airing_status,
          media_id: brandMediaId(row.mediaId),
          media_image: row.coverImage ?? undefined,
          media_title: row.mediaTitle,
          unit_kind: row.mediaKind === "anime" ? "episode" : "volume",
          unit_number: row.unitNumber,
          unit_title: row.title ?? undefined,
          is_future: timeline.is_future,
          next_airing_unit:
            row.nextAiringAt && row.nextAiringUnit
              ? {
                  airing_at: row.nextAiringAt,
                  unit_number: row.nextAiringUnit,
                }
              : undefined,
        } satisfies MissingUnit;
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
          .from(mediaUnits)
          .innerJoin(media, eq(media.id, mediaUnits.mediaId))
          .where(and(sql`${mediaUnits.aired} >= ${start}`, sql`${mediaUnits.aired} <= ${end}`))
          .orderBy(mediaUnits.aired, media.titleRomaji),
      );

      return rows.map(({ media: animeRow, media_units: episodeRow }) => {
        const timeline = deriveEpisodeTimelineMetadata(episodeRow.aired ?? undefined, now);

        return {
          all_day: isAllDayAiring(episodeRow.aired),
          end: episodeRow.aired ?? nowIsoValue,
          extended_props: {
            airing_status: timeline.airing_status,
            media_id: brandMediaId(animeRow.id),
            media_image: animeRow.coverImage ?? undefined,
            media_title: animeRow.titleRomaji,
            downloaded: episodeRow.downloaded,
            unit_kind: animeRow.mediaKind === "anime" ? "episode" : "volume",
            unit_number: episodeRow.number,
            unit_title: episodeRow.title ?? undefined,
            is_future: timeline.is_future,
          },
          id: `${animeRow.id}-${episodeRow.number}`,
          start: episodeRow.aired ?? nowIsoValue,
          title: buildCalendarEventTitle(animeRow.titleRomaji, episodeRow, animeRow.mediaKind),
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
      mediaId: number,
    ) {
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      return yield* buildRenamePreview(db, mediaId, runtimeConfig);
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
  mediaTitle: string,
  episodeRow: { number: number; title: string | null },
  mediaKind: string,
) {
  const unitLabel = mediaKind === "anime" ? "MediaUnit" : "Volume";

  return episodeRow.title
    ? `${mediaTitle} - ${unitLabel} ${episodeRow.number}: ${episodeRow.title}`
    : `${mediaTitle} - ${unitLabel} ${episodeRow.number}`;
}
