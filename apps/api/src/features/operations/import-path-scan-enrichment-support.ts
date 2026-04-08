import { Effect } from "effect";

import type { ScannedFile } from "@packages/shared/index.ts";
import {
  mergeProbedMediaMetadata,
  probeMediaMetadataOrUndefined,
  shouldProbeMediaMetadata,
  type MediaProbeShape,
} from "@/lib/media-probe.ts";

const ENRICH_IMPORT_SCAN_CONCURRENCY = 4;

export const enrichImportScanFiles = Effect.fn("Operations.enrichImportScanFiles")(
  function* (input: {
    readonly files: readonly ScannedFile[];
    readonly mediaProbe: MediaProbeShape;
  }) {
    const enrichScannedImportFile = Effect.fn("Operations.enrichScannedImportFile")(function* (
      file: ScannedFile,
    ) {
      if (!shouldProbeMediaMetadata(file)) {
        return file;
      }

      const probeMetadata = yield* probeMediaMetadataOrUndefined(
        input.mediaProbe,
        file.source_path,
      );

      return mergeProbedMediaMetadata(file, probeMetadata);
    });

    return yield* Effect.forEach(input.files, enrichScannedImportFile, {
      concurrency: ENRICH_IMPORT_SCAN_CONCURRENCY,
    });
  },
);
