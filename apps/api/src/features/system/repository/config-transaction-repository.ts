import { Effect } from "effect";

import type { AppDatabase } from "../../../db/database.ts";
import { appConfig, qualityProfiles } from "../../../db/schema.ts";
import { tryDatabasePromise } from "../../../lib/effect-db.ts";

export const updateSystemConfigAtomic = Effect.fn(
  "SystemConfigTransactionRepository.updateSystemConfigAtomic",
)(function* (
  db: AppDatabase,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* tryDatabasePromise("Failed to update system config", () =>
    db.transaction(async (tx) => {
      await tx
        .insert(appConfig)
        .values(coreInput)
        .onConflictDoUpdate({
          target: appConfig.id,
          set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
        });

      await tx.delete(qualityProfiles);

      if (profileRows.length > 0) {
        await tx.insert(qualityProfiles).values([...profileRows]);
      }
    }),
  );
});
