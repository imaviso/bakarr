import { Effect, Option, Ref } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";

export type RuntimeConfigSnapshotError =
  | DatabaseError
  | StoredConfigCorruptError
  | StoredConfigMissingError;

export interface RuntimeConfigSnapshotServiceShape {
  readonly getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
  readonly replaceRuntimeConfig: (config: Config) => Effect.Effect<void>;
}

const makeRuntimeConfigSnapshotService = Effect.fn("RuntimeConfigSnapshotService.make")(
  function* () {
    const systemConfigService = yield* SystemConfigService;
    const configRef = yield* Ref.make(Option.none<Config>());
    const loadSemaphore = yield* Effect.makeSemaphore(1);

    const getRuntimeConfig = Effect.fn("RuntimeConfigSnapshotService.getRuntimeConfig")(
      function* () {
        const current = yield* Ref.get(configRef);

        if (Option.isSome(current)) {
          return current.value;
        }

        return yield* loadSemaphore.withPermits(1)(
          Effect.gen(function* () {
            const reloaded = yield* Ref.get(configRef);

            if (Option.isSome(reloaded)) {
              return reloaded.value;
            }

            const loaded = yield* systemConfigService.getConfig();
            yield* Ref.set(configRef, Option.some(loaded));
            return loaded;
          }),
        );
      },
    );

    const replaceRuntimeConfig = Effect.fn("RuntimeConfigSnapshotService.replaceRuntimeConfig")(
      function* (config: Config) {
        yield* Ref.set(configRef, Option.some(config));
      },
    );

    const service: RuntimeConfigSnapshotServiceShape = {
      getRuntimeConfig,
      replaceRuntimeConfig,
    };
    return service;
  },
);

export class RuntimeConfigSnapshotService extends Effect.Service<RuntimeConfigSnapshotService>()(
  "@bakarr/api/RuntimeConfigSnapshotService",
  {
    effect: makeRuntimeConfigSnapshotService(),
  },
) {}

export const RuntimeConfigSnapshotServiceLive = RuntimeConfigSnapshotService.Default;
