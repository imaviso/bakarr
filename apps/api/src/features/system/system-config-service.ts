import { Context, Effect, Layer } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import {
  composeConfig,
  effectDecodeStoredConfigRow,
  effectDecodeQualityProfileRow,
} from "./config-codec.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "./errors.ts";
import { normalizeConfig } from "./qbittorrent-config.ts";
import { listQualityProfileRows } from "./repository/quality-profile-repository.ts";
import { loadSystemConfigRow } from "./repository/system-config-repository.ts";

export interface SystemConfigServiceShape {
  readonly getConfig: () => Effect.Effect<
    Config,
    DatabaseError | StoredConfigCorruptError | StoredConfigMissingError
  >;
}

export class SystemConfigService extends Context.Tag("@bakarr/api/SystemConfigService")<
  SystemConfigService,
  SystemConfigServiceShape
>() {}

const makeSystemConfigService = Effect.gen(function* () {
  const { db } = yield* Database;

  const getConfig = Effect.fn("SystemConfigService.getConfig")(function* () {
    const storedConfig = yield* loadSystemConfigRow(db);
    const profiles = yield* listQualityProfileRows(db);

    const core = yield* effectDecodeStoredConfigRow(storedConfig).pipe(
      Effect.catchTag("StoredConfigCorruptError", () =>
        Effect.fail(
          new StoredConfigCorruptError({
            message:
              "Stored configuration is corrupt and could not be decoded. Re-save config to repair.",
          }),
        ),
      ),
    );
    const decodedProfiles = yield* Effect.forEach(profiles, effectDecodeQualityProfileRow);

    return yield* normalizeConfig(composeConfig(core, decodedProfiles)).pipe(
      Effect.catchTag("ConfigValidationError", (error) =>
        Effect.fail(
          new StoredConfigCorruptError({
            message: `Stored configuration is corrupt and could not be normalized: ${error.message}`,
          }),
        ),
      ),
    );
  });

  return { getConfig } satisfies SystemConfigServiceShape;
});

export const SystemConfigServiceLive = Layer.effect(SystemConfigService, makeSystemConfigService);
