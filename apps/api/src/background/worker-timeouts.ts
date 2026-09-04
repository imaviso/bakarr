import { Config, Context, Effect, Layer } from "effect";

import { PositiveIntConfigSchema } from "@/infra/schema.ts";
import {
  BACKGROUND_WORKER_NAMES,
  BACKGROUND_WORKER_TIMEOUT_MS,
  type BackgroundWorkerName,
} from "@/background/worker-model.ts";

const timeoutMsConfig = (key: string, fallback: number) =>
  Config.schema(PositiveIntConfigSchema, key).pipe(Config.withDefault(fallback));

export interface BackgroundWorkerTimeoutsShape {
  readonly get: (workerName: BackgroundWorkerName) => number;
}

type MutableTimeoutByName = { -readonly [workerName in BackgroundWorkerName]: number };

/**
 * Per-worker run timeouts, resolved once at layer construction from env
 * (BAKARR_<WORKER>_TIMEOUT_MS, key derived from the worker name). Defaults
 * keep the historical values; raise them (e.g. BAKARR_LIBRARY_SCAN_TIMEOUT_MS)
 * when long library scans are killed every cycle by the hardcoded caps.
 */
export class BackgroundWorkerTimeouts extends Context.Service<
  BackgroundWorkerTimeouts,
  BackgroundWorkerTimeoutsShape
>()("@bakarr/api/BackgroundWorkerTimeouts") {
  static readonly layer = Layer.effect(
    BackgroundWorkerTimeouts,
    Effect.gen(function* () {
      // Start from the defaults table so the accumulator is complete without
      // a cast; each configured value overwrites its default below.
      const byName: MutableTimeoutByName = { ...BACKGROUND_WORKER_TIMEOUT_MS };

      for (const workerName of BACKGROUND_WORKER_NAMES) {
        byName[workerName] = yield* timeoutMsConfig(
          `BAKARR_${workerName.toUpperCase()}_TIMEOUT_MS`,
          BACKGROUND_WORKER_TIMEOUT_MS[workerName],
        );
      }

      return {
        get: (workerName) => byName[workerName],
      } satisfies BackgroundWorkerTimeoutsShape;
    }),
  );
}

export const BackgroundWorkerTimeoutsLive = BackgroundWorkerTimeouts.layer;
