import type { RenamePreviewItem } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { buildRenamePreview } from "@/features/operations/library/library-import.ts";
import { Context, Effect, Layer } from "effect";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";

/** Rename preview only — wanted/calendar use MediaRepository + nowIso at route. */
export interface CatalogLibraryReadServiceShape {
  readonly getRenamePreview: (
    mediaId: number,
  ) => Effect.Effect<
    RenamePreviewItem[],
    DatabaseError | MediaNotFoundError | RuntimeConfigSnapshotError
  >;
}

export class CatalogLibraryReadService extends Context.Service<
  CatalogLibraryReadService,
  CatalogLibraryReadServiceShape
>()("@bakarr/api/CatalogLibraryReadService") {
  static readonly layer = Layer.effect(
    CatalogLibraryReadService,
    Effect.gen(function* () {
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const mediaRepository = yield* MediaRepository;

      const getRenamePreview = Effect.fn("CatalogLibraryReadService.getRenamePreview")(function* (
        mediaId: number,
      ) {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        return yield* buildRenamePreview(mediaId, runtimeConfig, mediaRepository);
      });

      return {
        getRenamePreview,
      } satisfies CatalogLibraryReadServiceShape;
    }),
  );
}

export const CatalogLibraryReadServiceLive = CatalogLibraryReadService.layer;
