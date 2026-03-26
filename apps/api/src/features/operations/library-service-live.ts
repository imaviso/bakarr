import { Effect, Layer } from "effect";

import { CatalogOrchestration, SearchOrchestration } from "./operations-orchestration.ts";
import {
  LibraryCommandService,
  LibraryReadService,
  type LibraryCommandServiceShape,
  type LibraryReadServiceShape,
} from "./service-contract.ts";

export const LibraryReadServiceLive = Layer.effect(
  LibraryReadService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;

    return {
      getCalendar: catalog.getCalendar,
      getRenamePreview: catalog.getRenamePreview,
      getUnmappedFolders: search.getUnmappedFolders,
      getWantedMissing: catalog.getWantedMissing,
    } satisfies LibraryReadServiceShape;
  }),
);

export const LibraryCommandServiceLive = Layer.effect(
  LibraryCommandService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;

    return {
      bulkControlUnmappedFolders: search.bulkControlUnmappedFolders,
      controlUnmappedFolder: search.controlUnmappedFolder,
      importFiles: catalog.importFiles,
      importUnmappedFolder: search.importUnmappedFolder,
      renameFiles: catalog.renameFiles,
      runLibraryScan: catalog.runLibraryScan,
      runUnmappedScan: search.runUnmappedScan,
      scanImportPath: search.scanImportPath,
    } satisfies LibraryCommandServiceShape;
  }),
);
