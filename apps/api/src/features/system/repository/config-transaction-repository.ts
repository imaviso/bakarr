import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { appConfig, qualityProfiles } from "@/db/schema.ts";
import { tryDatabase } from "@/infra/effect/db.ts";

export const updateSystemConfigAtomic = Effect.fn(
  "SystemConfigTransactionRepository.updateSystemConfigAtomic",
)(function* (
  db: AppDatabase,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* tryDatabase("Failed to update system config", () =>
    db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(appConfig)
          .values(coreInput)
          .onConflictDoUpdate({
            target: appConfig.id,
            set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
          });

        yield* tx.delete(qualityProfiles);

        if (profileRows.length > 0) {
          yield* tx.insert(qualityProfiles).values([...profileRows]);
        }
      }),
    ),
  );
});
