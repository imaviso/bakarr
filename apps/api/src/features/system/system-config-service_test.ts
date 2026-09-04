import { Cause, Effect, Exit, Layer } from "effect";

import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { AppDrizzleDatabase } from "@/db/database.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { assert, describe, it } from "@effect/vitest";
import * as schema from "@/db/schema.ts";
import { StoredConfigMissingError } from "@/features/system/errors.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  redactConfigSecrets,
  SystemConfigService,
} from "@/features/system/system-config-service.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";

describe("SystemConfigService", () => {
  it.effect("redactConfigSecrets strips qBittorrent and AniDB passwords for API responses", () =>
    Effect.sync(() => {
      const input = makeTestConfig("./test.sqlite", (config) => ({
        ...config,
        metadata: {
          ...config.metadata,
          anidb: {
            ...config.metadata!.anidb,
            client: "bakarr",
            username: "anidb-user",
            password: "anidb-pass",
          },
        },
        qbittorrent: {
          ...config.qbittorrent,
          username: "qb-user",
          password: "secret-pass",
        },
      }));
      const redacted = redactConfigSecrets(input);

      assert.deepStrictEqual(redacted.metadata?.anidb.password, null);
      assert.deepStrictEqual(redacted.metadata?.anidb.client, "bakarr");
      assert.deepStrictEqual(redacted.metadata?.anidb.username, "anidb-user");
      assert.deepStrictEqual(redacted.qbittorrent.password, null);
      assert.deepStrictEqual(redacted.qbittorrent.username, "qb-user");
    }),
  );

  it.effect("fails when the stored config row is missing", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, _exec) =>
        Effect.gen(function* () {
          const repositoryLayer = Layer.mergeAll(
            SystemConfigRepository.layer,
            QualityProfileRepository.layer,
          ).pipe(
            Layer.provide(Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.of(db))),
            Layer.provide(Layer.succeed(SqliteClient.SqliteClient, client)),
          );
          const layer = SystemConfigService.layer.pipe(Layer.provide(repositoryLayer));

          const exit = yield* Effect.exit(
            Effect.flatMap(SystemConfigService, (service) => service.getConfig()).pipe(
              Effect.provide(layer),
            ),
          );

          assert.deepStrictEqual(Exit.isFailure(exit), true);

          if (Exit.isFailure(exit)) {
            const failure = Cause.findErrorOption(exit.cause);
            assert.deepStrictEqual(failure._tag, "Some", Cause.pretty(exit.cause));

            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "StoredConfigMissingError");
              assert.deepStrictEqual(failure.value instanceof StoredConfigMissingError, true);
            }
          }
        }),
      schema,
    }),
  );
});
