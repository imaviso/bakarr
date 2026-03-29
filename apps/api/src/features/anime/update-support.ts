import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import { appendSystemLog } from "../system/support.ts";
import { requireAnimeExistsEffect } from "./repository.ts";

export const updateAnimeRow = Effect.fn("AnimeUpdateSupport.updateAnimeRow")(function* (
  db: AppDatabase,
  animeId: number,
  patch: Partial<typeof anime.$inferInsert>,
  message: string,
  eventPublisher: Pick<EventPublisherShape, "publishInfo">,
  nowIso: () => Effect.Effect<string>,
) {
  yield* requireAnimeExistsEffect(db, animeId);
  yield* tryDatabasePromise("Failed to update anime", () =>
    db.update(anime).set(patch).where(eq(anime.id, animeId)),
  );
  yield* appendSystemLog(db, "anime.updated", "success", message, nowIso);
  yield* eventPublisher.publishInfo(message);
});
