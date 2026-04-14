import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import type { AnimeMetadataEpisode } from "@/features/anime/anilist-model.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const syncEpisodeMetadataEffect = Effect.fn("AnimeService.syncEpisodeMetadataEffect")(
  function* (
    db: AppDatabase,
    animeId: number,
    episodeMetadata: ReadonlyArray<AnimeMetadataEpisode> | undefined,
  ) {
    if (!Array.isArray(episodeMetadata) || episodeMetadata.length === 0) {
      return;
    }

    yield* tryDatabasePromise("Failed to sync episode metadata", () =>
      db.transaction(async (tx) => {
        for (const entry of episodeMetadata) {
          const updateSet = {
            ...(entry.aired === undefined ? {} : { aired: entry.aired }),
            ...(entry.durationSeconds === undefined
              ? {}
              : { durationSeconds: entry.durationSeconds }),
            ...(entry.title === undefined ? {} : { title: entry.title }),
          };

          const insertBase = {
            aired: entry.aired ?? null,
            animeId,
            durationSeconds: entry.durationSeconds ?? null,
            number: entry.number,
            title: entry.title ?? null,
          };

          if (Object.keys(updateSet).length === 0) {
            await tx.insert(episodes).values(insertBase).onConflictDoNothing();
            continue;
          }

          await tx
            .insert(episodes)
            .values(insertBase)
            .onConflictDoUpdate({
              target: [episodes.animeId, episodes.number],
              set: updateSet,
            });
        }
      }),
    );
  },
);
