import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { qualityProfiles } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";

export const qualityProfileExistsEffect = Effect.fn("AnimeProfileSupport.qualityProfileExists")(
  function* (db: AppDatabase, name: string) {
    const rows = yield* tryDatabasePromise("Failed to verify quality profile", () =>
      db
        .select({ name: qualityProfiles.name })
        .from(qualityProfiles)
        .where(eq(qualityProfiles.name, name))
        .limit(1),
    );
    return rows.length > 0;
  },
);
