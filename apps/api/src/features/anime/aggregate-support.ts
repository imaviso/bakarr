import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes, systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const insertAnimeAggregateAtomicEffect = Effect.fn(
  "AnimeAggregateSupport.insertAnimeAggregateAtomic",
)(function* (
  db: AppDatabase,
  input: {
    animeRow: typeof anime.$inferInsert;
    episodeRows: readonly (typeof episodes.$inferInsert)[];
    log: typeof systemLogs.$inferInsert;
  },
) {
  yield* tryDatabasePromise("Failed to insert anime aggregate", () =>
    db.transaction(async (tx) => {
      await tx.insert(anime).values(input.animeRow);

      if (input.episodeRows.length > 0) {
        await tx.insert(episodes).values([...input.episodeRows]);
      }

      await tx.insert(systemLogs).values(input.log);
    }),
  );
});
