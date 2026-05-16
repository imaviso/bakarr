import { and, eq, inArray } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export class UpsertEpisodeFileError extends Schema.TaggedError<UpsertEpisodeFileError>()(
  "UpsertEpisodeFileError",
  {
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const upsertEpisodeFilesAtomic = Effect.fn("Operations.upsertEpisodeFilesAtomic")(function* (
  db: AppDatabase,
  animeId: number,
  episodeNumbers: readonly number[],
  destination: string,
) {
  if (episodeNumbers.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to upsert episode files", () =>
    db.transaction(async (tx) => {
      const episodeNumbersArr = [...episodeNumbers];

      const existingRows = await tx
        .select()
        .from(episodes)
        .where(and(eq(episodes.animeId, animeId), inArray(episodes.number, episodeNumbersArr)));

      const existingEpisodeNumbers = new Set(existingRows.map((r) => r.number));
      const missingEpisodeNumbers = episodeNumbersArr.filter((n) => !existingEpisodeNumbers.has(n));

      if (existingEpisodeNumbers.size > 0) {
        await tx
          .update(episodes)
          .set({
            downloaded: true,
            filePath: destination,
          })
          .where(
            and(
              eq(episodes.animeId, animeId),
              inArray(episodes.number, [...existingEpisodeNumbers]),
            ),
          );
      }

      if (missingEpisodeNumbers.length > 0) {
        const valuesToInsert = missingEpisodeNumbers.map((num) => ({
          aired: null,
          animeId,
          downloaded: true,
          filePath: destination,
          number: num,
          title: null,
        }));

        await tx
          .insert(episodes)
          .values(valuesToInsert)
          .onConflictDoUpdate({
            target: [episodes.animeId, episodes.number],
            set: {
              downloaded: true,
              filePath: destination,
            },
          });
      }
    }),
  ).pipe(
    Effect.mapError(
      (cause) =>
        new UpsertEpisodeFileError({
          anime_id: animeId,
          episode_number: episodeNumbers[0] ?? 0,
          message: cause.message,
          cause,
        }),
    ),
  );
});

export const upsertEpisodeFile = Effect.fn("Operations.upsertEpisodeFile")(function* (
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
  destination: string,
) {
  yield* upsertEpisodeFilesAtomic(db, animeId, [episodeNumber], destination);
});
