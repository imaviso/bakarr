import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { mediaUnits } from "@/db/schema.ts";
import { toAnimeDto } from "@/features/media/shared/dto.ts";
import type { MediaReadRepositoryShape } from "@/features/media/shared/media-read-repository.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const getAnimeEffect = Effect.fn("AnimeQueryGet.getAnimeEffect")(function* (input: {
  db: AppDatabase;
  id: number;
  mediaReadRepository: MediaReadRepositoryShape;
}) {
  const row = yield* input.mediaReadRepository.getAnimeRow(input.id);
  const episodeRows = yield* tryDatabasePromise("Failed to load media", () =>
    input.db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, input.id)),
  );

  return yield* toAnimeDto(row, episodeRows);
});
