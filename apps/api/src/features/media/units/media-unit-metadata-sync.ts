import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { mediaUnits } from "@/db/schema.ts";
import type { AnimeMetadataEpisode } from "@/features/media/metadata/anilist-model.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const syncEpisodeMetadataEffect = Effect.fn("AnimeService.syncEpisodeMetadataEffect")(
  function* (
    db: AppDatabase,
    mediaId: number,
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
            mediaId,
            durationSeconds: entry.durationSeconds ?? null,
            number: entry.number,
            title: entry.title ?? null,
          };

          if (Object.keys(updateSet).length === 0) {
            await tx.insert(mediaUnits).values(insertBase).onConflictDoNothing();
            continue;
          }

          await tx
            .insert(mediaUnits)
            .values(insertBase)
            .onConflictDoUpdate({
              target: [mediaUnits.mediaId, mediaUnits.number],
              set: updateSet,
            });
        }
      }),
    );
  },
);
