import { and, eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";

export const getAnimeRowEffect = Effect.fn("AnimeRepository.getAnimeRow")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load media", () =>
    db.select().from(media).where(eq(media.id, mediaId)).limit(1),
  );
  const [row] = rows;
  if (!row) {
    return yield* new MediaNotFoundError({ message: "Media not found" });
  }
  return row;
});

export const requireAnimeExistsEffect = Effect.fn("AnimeRepository.requireAnimeExists")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  yield* getAnimeRowEffect(db, mediaId);
});

export const getEpisodeRowEffect = Effect.fn("AnimeRepository.getEpisodeRow")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumber: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load episode", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
      .limit(1),
  );
  const [row] = rows;
  if (!row) {
    return yield* new MediaNotFoundError({ message: "MediaUnit not found" });
  }
  return row;
});

export const loadCurrentEpisodeState = Effect.fn("AnimeRepository.loadCurrentEpisodeState")(
  function* (db: AppDatabase, mediaId: number, unitNumber: number) {
    const rows = yield* tryDatabasePromise("Failed to load episode state", () =>
      db
        .select()
        .from(mediaUnits)
        .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
        .limit(1),
    );

    const [row] = rows;

    return row
      ? Option.some({
          downloaded: row.downloaded,
          ...(row.filePath == null ? {} : { filePath: row.filePath }),
        })
      : Option.none();
  },
);

export const findAnimeRootFolderOwnerEffect = Effect.fn("AnimeRepository.findAnimeRootFolderOwner")(
  function* (db: AppDatabase, rootFolder: string) {
    const normalized = normalizeRootFolder(rootFolder);
    const rows = yield* tryDatabasePromise("Failed to find media root folder owner", () =>
      db
        .select({
          id: media.id,
          rootFolder: media.rootFolder,
          titleRomaji: media.titleRomaji,
        })
        .from(media),
    );

    return (
      rows.find((row) => {
        const existing = normalizeRootFolder(row.rootFolder);
        return (
          existing === normalized ||
          normalized.startsWith(`${existing}/`) ||
          existing.startsWith(`${normalized}/`)
        );
      }) ?? null
    );
  },
);

function normalizeRootFolder(rootFolder: string) {
  if (rootFolder === "/") {
    return "/";
  }

  return rootFolder.replace(/\/+$/, "");
}
