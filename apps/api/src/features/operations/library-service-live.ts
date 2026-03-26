import { Effect, Layer } from "effect";

import { CatalogOrchestration, SearchOrchestration } from "./operations-orchestration.ts";
import { LibraryService, type LibraryServiceShape } from "./service-contract.ts";

export const LibraryServiceLive = Layer.effect(
  LibraryService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;

    return {
      bulkControlUnmappedFolders: search.bulkControlUnmappedFolders,
      controlUnmappedFolder: search.controlUnmappedFolder,
      getCalendar: catalog.getCalendar,
      getRenamePreview: catalog.getRenamePreview,
      getUnmappedFolders: search.getUnmappedFolders,
      getWantedMissing: catalog.getWantedMissing,
      importFiles: catalog.importFiles,
      importUnmappedFolder: search.importUnmappedFolder,
      renameFiles: catalog.renameFiles,
      runLibraryScan: catalog.runLibraryScan,
      runUnmappedScan: search.runUnmappedScan,
      scanImportPath: search.scanImportPath,
    } satisfies LibraryServiceShape;
  }),
);
