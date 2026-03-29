import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { toDatabaseError, type TryDatabasePromise } from "../../lib/effect-db.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  makeCatalogLibraryReadSupport,
  type CatalogLibraryReadSupportShape,
} from "./catalog-library-read-support.ts";

export interface CatalogLibraryRuntimeShape {
  readonly db: AppDatabase;
  readonly dbError: typeof toDatabaseError;
  readonly eventBus: typeof EventBus.Service;
  readonly fs: FileSystemShape;
  readonly libraryReadSupport: CatalogLibraryReadSupportShape;
  readonly mediaProbe: MediaProbeShape;
  readonly nowIso: () => Effect.Effect<string>;
  readonly publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  readonly tryDatabasePromise: TryDatabasePromise;
}

export function makeCatalogLibraryRuntime(input: {
  readonly currentTimeMillis: () => Effect.Effect<number>;
  readonly db: AppDatabase;
  readonly eventBus: typeof EventBus.Service;
  readonly fs: FileSystemShape;
  readonly mediaProbe: MediaProbeShape;
  readonly publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  readonly tryDatabasePromise: TryDatabasePromise;
}): CatalogLibraryRuntimeShape {
  const {
    currentTimeMillis,
    db,
    eventBus,
    fs,
    mediaProbe,
    publishLibraryScanProgress,
    tryDatabasePromise,
  } = input;

  return {
    db,
    dbError: toDatabaseError,
    eventBus,
    fs,
    libraryReadSupport: makeCatalogLibraryReadSupport({
      currentTimeMillis,
      db,
      tryDatabasePromise,
    }),
    mediaProbe,
    nowIso: () => currentTimeMillis().pipe(Effect.map((value) => new Date(value).toISOString())),
    publishLibraryScanProgress,
    tryDatabasePromise,
  };
}
