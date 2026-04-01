import { Context, Effect, Layer, Option, Ref } from "effect";

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

export class RuntimeConfigSnapshotService extends Context.Tag(
  "@bakarr/api/RuntimeConfigSnapshotService",
)<RuntimeConfigSnapshotService, RuntimeConfigSnapshotServiceShape>() {}

export const RuntimeConfigSnapshotServiceLive = Layer.effect(
  RuntimeConfigSnapshotService,
  Effect.gen(function* () {
    const systemConfigService = yield* SystemConfigService;
    const configRef = yield* Ref.make(Option.none<Config>());

    const getRuntimeConfig = Effect.fn("RuntimeConfigSnapshotService.getRuntimeConfig")(
      function* () {
        const current = yield* Ref.get(configRef);

        if (Option.isSome(current)) {
          return current.value;
        }

        const loaded = yield* systemConfigService.getConfig();
        yield* Ref.set(configRef, Option.some(loaded));
        return loaded;
      },
    );

    const replaceRuntimeConfig = Effect.fn("RuntimeConfigSnapshotService.replaceRuntimeConfig")(
      function* (config: Config) {
        yield* Ref.set(configRef, Option.some(config));
      },
    );

    return RuntimeConfigSnapshotService.of({
      getRuntimeConfig,
      replaceRuntimeConfig,
    });
  }),
);
