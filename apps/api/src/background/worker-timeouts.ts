import { Config, Effect, Schema } from "effect";

import { PositiveIntSchema } from "@/domain/domain-schema.ts";
import { BACKGROUND_WORKER_TIMEOUT_MS, type BackgroundWorkerName } from "@/domain/worker-model.ts";

const PositiveIntConfigSchema = Schema.NumberFromString.pipe(Schema.compose(PositiveIntSchema));

const timeoutMsConfig = (key: string, fallback: number) =>
  Schema.Config(key, PositiveIntConfigSchema).pipe(Config.withDefault(fallback));

export interface BackgroundWorkerTimeoutsShape {
  readonly download_sync: number;
  readonly library_scan: number;
  readonly manami_refresh: number;
  readonly metadata_refresh: number;
  readonly rss: number;
}

/**
 * Per-worker run timeouts, resolved once at layer construction from env
 * (BAKARR_<WORKER>_TIMEOUT_MS). Defaults keep the historical values; raise
 * them (e.g. BAKARR_LIBRARY_SCAN_TIMEOUT_MS) when long library scans are
 * killed every cycle by the hardcoded caps.
 */
export class BackgroundWorkerTimeouts extends Effect.Service<BackgroundWorkerTimeouts>()(
  "@bakarr/api/BackgroundWorkerTimeouts",
  {
    effect: Effect.gen(function* () {
      return {
        download_sync: yield* timeoutMsConfig(
          "BAKARR_DOWNLOAD_SYNC_TIMEOUT_MS",
          BACKGROUND_WORKER_TIMEOUT_MS.download_sync,
        ),
        library_scan: yield* timeoutMsConfig(
          "BAKARR_LIBRARY_SCAN_TIMEOUT_MS",
          BACKGROUND_WORKER_TIMEOUT_MS.library_scan,
        ),
        manami_refresh: yield* timeoutMsConfig(
          "BAKARR_MANAMI_REFRESH_TIMEOUT_MS",
          BACKGROUND_WORKER_TIMEOUT_MS.manami_refresh,
        ),
        metadata_refresh: yield* timeoutMsConfig(
          "BAKARR_METADATA_REFRESH_TIMEOUT_MS",
          BACKGROUND_WORKER_TIMEOUT_MS.metadata_refresh,
        ),
        rss: yield* timeoutMsConfig("BAKARR_RSS_TIMEOUT_MS", BACKGROUND_WORKER_TIMEOUT_MS.rss),
      } satisfies Record<BackgroundWorkerName, number>;
    }),
  },
) {}
