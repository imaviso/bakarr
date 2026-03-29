import type { AppDatabase } from "@/db/database.ts";
import { makeCatalogLibraryWriteSupport } from "@/features/operations/catalog-orchestration-library-write-support.ts";
import { makeCatalogLibraryScanSupport } from "@/features/operations/catalog-library-scan-support.ts";
import type { CatalogLibraryReadSupportShape } from "@/features/operations/catalog-library-read-support.ts";
import { EventBus } from "@/features/events/event-bus.ts";

export function makeCatalogLibraryOrchestration(input: {
  readonly db: AppDatabase;
  readonly dbError: (
    message: string,
  ) => (cause: unknown) => import("@/db/database.ts").DatabaseError;
  readonly eventBus: typeof EventBus.Service;
  readonly fs: import("@/lib/filesystem.ts").FileSystemShape;
  readonly mediaProbe: import("@/lib/media-probe.ts").MediaProbeShape;
  readonly nowIso: () => import("effect").Effect.Effect<string>;
  readonly publishLibraryScanProgress: (scanned: number) => import("effect").Effect.Effect<void>;
  readonly tryDatabasePromise: import("@/lib/effect-db.ts").TryDatabasePromise;
  readonly libraryReadSupport: CatalogLibraryReadSupportShape;
}) {
  const {
    db,
    dbError,
    eventBus,
    fs,
    mediaProbe,
    nowIso,
    publishLibraryScanProgress,
    tryDatabasePromise,
    libraryReadSupport,
  } = input;

  const libraryWriteSupport = makeCatalogLibraryWriteSupport({
    db,
    dbError,
    eventBus,
    fs,
    mediaProbe,
    tryDatabasePromise,
  });
  const libraryScanSupport = makeCatalogLibraryScanSupport({
    db,
    dbError,
    eventBus,
    fs,
    nowIso,
    publishLibraryScanProgress,
    tryDatabasePromise,
  });

  return {
    ...libraryWriteSupport,
    ...libraryScanSupport,
    getCalendar: libraryReadSupport.getCalendar,
    getRenamePreview: libraryReadSupport.getRenamePreview,
    getWantedMissing: libraryReadSupport.getWantedMissing,
  };
}
