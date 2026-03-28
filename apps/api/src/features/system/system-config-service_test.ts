import { Cause, Effect, Exit, Layer } from "effect";

import { Database, type AppDatabase, type DatabaseService } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import { assertEquals, describe, it } from "../../test/vitest.ts";
import * as schema from "../../db/schema.ts";
import { StoredConfigMissingError } from "./errors.ts";
import { SystemConfigService, SystemConfigServiceLive } from "./system-config-service.ts";

describe("SystemConfigService", () => {
  it.scoped("fails when the stored config row is missing", () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, _databaseFile) =>
        Effect.gen(function* () {
          const layer = SystemConfigServiceLive.pipe(
            Layer.provide(
              Layer.succeed(Database, {
                client: {} as DatabaseService["client"],
                db: db as AppDatabase,
              }),
            ),
          );

          const exit = yield* Effect.exit(
            Effect.flatMap(SystemConfigService, (service) => service.getConfig()).pipe(
              Effect.provide(layer),
            ),
          );

          assertEquals(Exit.isFailure(exit), true);

          if (Exit.isFailure(exit)) {
            const failure = Cause.failureOption(exit.cause);
            assertEquals(failure._tag, "Some", Cause.pretty(exit.cause));

            if (failure._tag === "Some") {
              assertEquals(failure.value._tag, "StoredConfigMissingError");
              assertEquals(failure.value instanceof StoredConfigMissingError, true);
            }
          }
        }),
      schema,
    }),
  );
});
