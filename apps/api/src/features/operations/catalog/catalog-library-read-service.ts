import { Effect } from "effect";

import type { RenamePreviewItem } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { buildRenamePreview } from "@/features/operations/library/library-import.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";

/** Rename preview only — wanted/calendar use MediaReadRepository + nowIso at route. */
export interface CatalogLibraryReadServiceShape {
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

      const getRenamePreview = Effect.fn("CatalogLibraryReadService.getRenamePreview")(function* (
        mediaId: number,
      ) {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        return yield* buildRenamePreview(mediaId, runtimeConfig, mediaReadRepository);
      });

      return {
        getRenamePreview,
      } satisfies CatalogLibraryReadServiceShape;
    }),
    dependencies: [MediaReadRepository.Default],
  },
) {}

export const CatalogLibraryReadServiceLive = CatalogLibraryReadService.Default;
