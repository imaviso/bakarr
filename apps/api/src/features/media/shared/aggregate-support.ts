import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { media, mediaUnits, systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const insertAnimeAggregateAtomicEffect = Effect.fn(
  "AnimeAggregateSupport.insertAnimeAggregateAtomic",
)(function* (
  db: AppDatabase,
  input: {
    animeRow: typeof media.$inferInsert;
    episodeRows: readonly (typeof mediaUnits.$inferInsert)[];
    log: typeof systemLogs.$inferInsert;
  },
) {
  yield* tryDatabasePromise("Failed to insert media aggregate", () =>
    db.transaction(async (tx) => {
      await tx.insert(media).values(input.animeRow);

      if (input.episodeRows.length > 0) {
        await tx.insert(mediaUnits).values([...input.episodeRows]);
      }

      await tx.insert(systemLogs).values(input.log);
    }),
  );
});
