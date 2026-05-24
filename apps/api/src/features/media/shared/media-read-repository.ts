import { and, eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { queryFirst, tryDatabasePromise } from "@/infra/effect/db.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";

export interface MediaReadRepositoryShape {
  readonly getAnimeRow: (
    mediaId: number,
  ) => Effect.Effect<typeof media.$inferSelect, DatabaseError | MediaNotFoundError>;
  readonly requireAnimeExists: (
    mediaId: number,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError>;
  readonly getEpisodeRow: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<typeof mediaUnits.$inferSelect, DatabaseError | MediaNotFoundError>;
  readonly loadCurrentEpisodeState: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<
    Option.Option<{ readonly downloaded: boolean; readonly filePath?: string }>,
    DatabaseError
  >;
  readonly findAnimeRootFolderOwner: (
    rootFolder: string,
  ) => Effect.Effect<
    { readonly id: number; readonly rootFolder: string; readonly titleRomaji: string } | null,
    DatabaseError
  >;
}

export class MediaReadRepository extends Effect.Service<MediaReadRepository>()(
  "@bakarr/api/MediaReadRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeMediaReadRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

function makeMediaReadRepositoryShape(db: AppDatabase): MediaReadRepositoryShape {
  return {
    findAnimeRootFolderOwner: (rootFolder) => findAnimeRootFolderOwnerEffect(db, rootFolder),
    getAnimeRow: (mediaId) => getAnimeRowEffect(db, mediaId),
    getEpisodeRow: (mediaId, unitNumber) => getEpisodeRowEffect(db, mediaId, unitNumber),
    loadCurrentEpisodeState: (mediaId, unitNumber) =>
      loadCurrentEpisodeStateEffect(db, mediaId, unitNumber),
    requireAnimeExists: (mediaId) => requireAnimeExistsEffect(db, mediaId),
  } satisfies MediaReadRepositoryShape;
}

export function makeMediaReadRepository(db: AppDatabase): MediaReadRepository {
  return MediaReadRepository.make(makeMediaReadRepositoryShape(db));
}

const getAnimeRowEffect = Effect.fn("AnimeRepository.getAnimeRow")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const row = yield* queryFirst("Failed to load media", () =>
    db.select().from(media).where(eq(media.id, mediaId)).limit(1),
  );
  if (Option.isNone(row)) {
    return yield* new MediaNotFoundError({ message: "Media not found" });
  }
  return row.value;
});

const requireAnimeExistsEffect = Effect.fn("AnimeRepository.requireAnimeExists")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  yield* getAnimeRowEffect(db, mediaId);
});

const getEpisodeRowEffect = Effect.fn("AnimeRepository.getEpisodeRow")(function* (
  db: AppDatabase,
  mediaId: number,
  unitNumber: number,
) {
  const row = yield* queryFirst("Failed to load episode", () =>
    db
      .select()
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
      .limit(1),
  );
  if (Option.isNone(row)) {
    return yield* new MediaNotFoundError({ message: "MediaUnit not found" });
  }
  return row.value;
});

const loadCurrentEpisodeStateEffect = Effect.fn("AnimeRepository.loadCurrentEpisodeState")(
  function* (db: AppDatabase, mediaId: number, unitNumber: number) {
    const row = yield* queryFirst("Failed to load episode state", () =>
      db
        .select()
        .from(mediaUnits)
        .where(and(eq(mediaUnits.mediaId, mediaId), eq(mediaUnits.number, unitNumber)))
        .limit(1),
    );

    return Option.isSome(row)
      ? Option.some({
          downloaded: row.value.downloaded,
          ...(row.value.filePath == null ? {} : { filePath: row.value.filePath }),
        })
      : Option.none();
  },
);

const findAnimeRootFolderOwnerEffect = Effect.fn("AnimeRepository.findAnimeRootFolderOwner")(
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
