import { count, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const countAnimeUsingProfile = Effect.fn("ProfileUsageRepository.countAnimeUsingProfile")(
  function* (db: AppDatabase, profileName: string) {
    const rows = yield* tryDatabasePromise("Failed to count anime", () =>
      db.select({ value: count() }).from(anime).where(eq(anime.profileName, profileName)),
    );
    const row = rows[0];

    if (!row) {
      return 0;
    }

    return row.value;
  },
);
