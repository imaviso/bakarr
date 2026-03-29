import { Context, Effect, Layer } from "effect";

import { Database } from "../../db/database.ts";
import { ClockService } from "../../lib/clock.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import { EventBus } from "../events/event-bus.ts";
import { OperationsProgress } from "./download-service-tags.ts";
import { makeCatalogLibraryOrchestration } from "./catalog-library-orchestration.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { makeCatalogLibraryRuntime } from "./catalog-library-runtime.ts";

export type CatalogLibraryServiceShape = ReturnType<typeof makeCatalogLibraryOrchestration>;

export class CatalogLibraryService extends Context.Tag("@bakarr/api/CatalogLibraryService")<
  CatalogLibraryService,
  CatalogLibraryServiceShape
>() {}

export const CatalogLibraryServiceLive = Layer.effect(
  CatalogLibraryService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;
    const clock = yield* ClockService;
    const progress = yield* OperationsProgress;
    const runtime = makeCatalogLibraryRuntime({
      currentTimeMillis: () => clock.currentTimeMillis,
      db,
      eventBus,
      fs,
      mediaProbe,
      publishLibraryScanProgress: progress.publishLibraryScanProgress,
      tryDatabasePromise,
    });

    return makeCatalogLibraryOrchestration(runtime);
  }),
);
