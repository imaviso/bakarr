import { Effect } from "effect";

import type { CalendarEvent, MissingUnit, RenamePreviewItem } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { buildRenamePreview } from "@/features/operations/library/library-import.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
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
    DatabaseError | MediaNotFoundError | RuntimeConfigSnapshotError
  >;
}

export class CatalogLibraryReadService extends Effect.Service<CatalogLibraryReadService>()(
  "@bakarr/api/CatalogLibraryReadService",
  {
    effect: Effect.gen(function* () {
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const mediaReadRepository = yield* MediaReadRepository;
      const nowIso = currentNowIso;

      const getWantedMissing = Effect.fn("CatalogLibraryReadService.getWantedMissing")(function* (
        limit: number,
      ) {
        const now = yield* nowIso();
        return yield* mediaReadRepository.listWantedMissing(limit, now);
      });

      const getCalendar = Effect.fn("CatalogLibraryReadService.getCalendar")(function* (
        start: string,
        end: string,
      ) {
        const now = new Date(yield* nowIso());
        return yield* mediaReadRepository.listCalendarEvents(start, end, now);
      });

      const getCalendarWithDefaults = Effect.fn(
        "CatalogLibraryReadService.getCalendarWithDefaults",
      )(function* (input: { readonly start?: string; readonly end?: string }) {
        const nowIsoValue = yield* nowIso();
        return yield* getCalendar(input.start ?? nowIsoValue, input.end ?? nowIsoValue);
      });

      const getRenamePreview = Effect.fn("CatalogLibraryReadService.getRenamePreview")(function* (
        mediaId: number,
      ) {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        return yield* buildRenamePreview(mediaId, runtimeConfig, mediaReadRepository);
      });

      return {
        getCalendar,
        getCalendarWithDefaults,
        getRenamePreview,
        getWantedMissing,
      } satisfies CatalogLibraryReadServiceShape;
    }),
    dependencies: [MediaReadRepository.Default],
  },
) {}

export const CatalogLibraryReadServiceLive = CatalogLibraryReadService.Default;
