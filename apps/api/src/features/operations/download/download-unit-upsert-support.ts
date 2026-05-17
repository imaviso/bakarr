import { and, eq, inArray } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { mediaUnits } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export class UpsertEpisodeFileError extends Schema.TaggedError<UpsertEpisodeFileError>()(
  "UpsertEpisodeFileError",
  {
    media_id: Schema.Number,
    unit_number: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const upsertEpisodeFilesAtomic = Effect.fn("Operations.upsertEpisodeFilesAtomic")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumbers: readonly number[],
  destination: string,
) {
  if (unitNumbers.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to upsert episode files", () =>
    db.transaction(async (tx) => {
      const episodeNumbersArr = [...unitNumbers];

      const existingRows = await tx
        .select()
        .from(mediaUnits)
        .where(and(eq(mediaUnits.mediaId, mediaId), inArray(mediaUnits.number, episodeNumbersArr)));

      const existingEpisodeNumbers = new Set(existingRows.map((r) => r.number));
      const missingEpisodeNumbers = episodeNumbersArr.filter((n) => !existingEpisodeNumbers.has(n));

      if (existingEpisodeNumbers.size > 0) {
        await tx
          .update(mediaUnits)
          .set({
            downloaded: true,
            filePath: destination,
          })
          .where(
            and(
              eq(mediaUnits.mediaId, mediaId),
              inArray(mediaUnits.number, [...existingEpisodeNumbers]),
            ),
          );
      }

      if (missingEpisodeNumbers.length > 0) {
        const valuesToInsert = missingEpisodeNumbers.map((num) => ({
          aired: null,
          mediaId,
          downloaded: true,
          filePath: destination,
          number: num,
          title: null,
        }));

        await tx
          .insert(mediaUnits)
          .values(valuesToInsert)
          .onConflictDoUpdate({
            target: [mediaUnits.mediaId, mediaUnits.number],
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
          media_id: mediaId,
          unit_number: unitNumbers[0] ?? 0,
          message: cause.message,
          cause,
        }),
    ),
  );
});

export const upsertEpisodeFile = Effect.fn("Operations.upsertEpisodeFile")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumber: number,
  destination: string,
) {
  yield* upsertEpisodeFilesAtomic(db, mediaId, [unitNumber], destination);
});
