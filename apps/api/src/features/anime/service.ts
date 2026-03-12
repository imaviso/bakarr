import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type {
  Anime,
  AnimeSearchResult,
  Episode,
  NotificationEvent,
  VideoFile,
} from "../../../../../packages/shared/src/index.ts";
import {
  type AppDatabase,
  Database,
  DatabaseError,
} from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import { EventBus } from "../events/event-bus.ts";
import { AniListClient } from "./anilist.ts";
import { encodeNumberList, encodeStringList } from "../system/config-codec.ts";
import { toAnimeDto } from "./dto.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  type AnimeServiceError,
} from "./errors.ts";
import { collectVideoFiles, parseEpisodeNumber } from "./files.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import {
  appendAnimeLog,
  clearEpisodeMapping,
  ensureEpisodes,
  getAnimeRowOrThrow,
  getEpisodeRowOrThrow,
  inferAiredAt,
  requireAnimeExists,
  resolveAnimeRootFolder,
  upsertEpisode,
} from "./repository.ts";

export interface AddAnimeInput {
  readonly id: number;
  readonly profile_name: string;
  readonly root_folder: string;
  readonly monitor_and_search: boolean;
  readonly monitored: boolean;
  readonly release_profile_ids: number[];
}

export interface AnimeServiceShape {
  readonly listAnime: () => Effect.Effect<Anime[], DatabaseError>;
  readonly getAnime: (
    id: number,
  ) => Effect.Effect<Anime, AnimeServiceError | DatabaseError>;
  readonly searchAnime: (
    query: string,
  ) => Effect.Effect<AnimeSearchResult[], never>;
  readonly getAnimeByAnilistId: (
    id: number,
  ) => Effect.Effect<AnimeSearchResult, AnimeNotFoundError>;
  readonly addAnime: (
    input: AddAnimeInput,
  ) => Effect.Effect<
    Anime,
    AnimeNotFoundError | AnimeConflictError | DatabaseError
  >;
  readonly deleteAnime: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly setMonitored: (
    id: number,
    monitored: boolean,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly updatePath: (
    id: number,
    path: string,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly updateProfile: (
    id: number,
    profileName: string,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly updateReleaseProfiles: (
    id: number,
    releaseProfileIds: number[],
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly listEpisodes: (
    animeId: number,
  ) => Effect.Effect<Episode[], DatabaseError>;
  readonly refreshEpisodes: (
    animeId: number,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly scanFolder: (
    animeId: number,
  ) => Effect.Effect<
    { found: number; total: number },
    AnimeServiceError | DatabaseError
  >;
  readonly deleteEpisodeFile: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly mapEpisode: (
    animeId: number,
    episodeNumber: number,
    filePath: string,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly bulkMapEpisodes: (
    animeId: number,
    mappings: readonly { episode_number: number; file_path: string }[],
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly listFiles: (
    animeId: number,
  ) => Effect.Effect<VideoFile[], AnimeServiceError | DatabaseError>;
}

export class AnimeService extends Context.Tag("@bakarr/api/AnimeService")<
  AnimeService,
  AnimeServiceShape
>() {}

const makeAnimeService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;

  const addAnime = Effect.fn("AnimeService.addAnime")(function* (
    input: AddAnimeInput,
  ) {
    const existing = yield* tryDatabasePromise(
      "Failed to add anime",
      () =>
        db.select({ id: anime.id }).from(anime).where(eq(anime.id, input.id))
          .limit(1),
    );

    if (existing[0]) {
      yield* new AnimeConflictError({
        message: "Anime already exists",
      });
    }

    const metadata = yield* aniList.getAnimeMetadataById(input.id);

    if (!metadata) {
      yield* new AnimeNotFoundError({
        message: "Anime not found",
      });
    }

    const animeMetadata = metadata!;

    const rootFolder = yield* tryAnimePromise(
      "Failed to add anime",
      () =>
        resolveAnimeRootFolder(
          db,
          input.root_folder,
          animeMetadata.title.romaji,
        ),
    );

    yield* fs.mkdir(rootFolder, { recursive: true }).pipe(
      Effect.mapError((error) =>
        new DatabaseError({ cause: error, message: "Failed to add anime" })
      ),
    );

    const animeRow = {
      addedAt: new Date().toISOString(),
      bannerImage: animeMetadata.bannerImage ?? null,
      coverImage: animeMetadata.coverImage ?? null,
      description: animeMetadata.description ?? null,
      episodeCount: animeMetadata.episodeCount ?? null,
      endDate: animeMetadata.endDate ?? null,
      format: animeMetadata.format,
      genres: encodeStringList(animeMetadata.genres ?? []),
      id: animeMetadata.id,
      malId: animeMetadata.malId ?? null,
      monitored: input.monitored,
      profileName: input.profile_name,
      releaseProfileIds: encodeNumberList(input.release_profile_ids),
      rootFolder,
      score: animeMetadata.score ?? null,
      startDate: animeMetadata.startDate ?? null,
      status: animeMetadata.status,
      studios: encodeStringList(animeMetadata.studios ?? []),
      titleEnglish: animeMetadata.title.english ?? null,
      titleNative: animeMetadata.title.native ?? null,
      titleRomaji: animeMetadata.title.romaji,
    };

    yield* tryDatabasePromise(
      "Failed to add anime",
      () => db.insert(anime).values(animeRow),
    );
    yield* tryAnimePromise("Failed to add anime", () =>
      ensureEpisodes(
        db,
        animeRow.id,
        animeMetadata.episodeCount,
        animeMetadata.status,
        animeMetadata.startDate ?? undefined,
        animeMetadata.endDate ?? undefined,
        true,
      ));
    yield* tryDatabasePromise("Failed to add anime", () =>
      appendAnimeLog(
        db,
        "anime.created",
        "success",
        `Added ${animeRow.titleRomaji} to library`,
      ));
    yield* eventBus.publish({
      type: "Info",
      payload: { message: `Added ${animeRow.titleRomaji} to library` },
    });

    const episodeRows = yield* tryDatabasePromise(
      "Failed to add anime",
      () => db.select().from(episodes).where(eq(episodes.animeId, animeRow.id)),
    );

    return toAnimeDto(animeRow, episodeRows);
  });

  const refreshEpisodes = Effect.fn("AnimeService.refreshEpisodes")(function* (
    animeId: number,
  ) {
    const animeRow = yield* tryAnimePromise(
      "Failed to refresh episodes",
      () => getAnimeRowOrThrow(db, animeId),
    );

    yield* tryAnimePromise("Failed to refresh episodes", () =>
      ensureEpisodes(
        db,
        animeId,
        animeRow.episodeCount ?? undefined,
        animeRow.status,
        animeRow.startDate ?? undefined,
        animeRow.endDate ?? undefined,
        false,
      ));
    yield* tryDatabasePromise(
      "Failed to refresh episodes",
      () =>
        appendAnimeLog(
          db,
          "anime.episodes.refreshed",
          "success",
          `Refreshed episodes for ${animeRow.titleRomaji}`,
        ),
    );
    yield* eventBus.publish({
      type: "RefreshFinished",
      payload: { anime_id: animeId, title: animeRow.titleRomaji },
    });
  });

  const scanFolder = Effect.fn("AnimeService.scanFolder")(function* (
    animeId: number,
  ) {
    const animeRow = yield* tryAnimePromise(
      "Failed to scan anime folder",
      () => getAnimeRowOrThrow(db, animeId),
    );
    const files = yield* collectVideoFiles(fs, animeRow.rootFolder).pipe(
      Effect.mapError((error) =>
        new DatabaseError({
          cause: error,
          message: "Failed to scan anime folder",
        })
      ),
    );
    let found = 0;

    for (const file of files) {
      const episodeNumber = parseEpisodeNumber(file.path);

      if (!episodeNumber) {
        continue;
      }

      yield* tryAnimePromise(
        "Failed to scan anime folder",
        () =>
          upsertEpisode(db, animeId, episodeNumber, {
            aired: inferAiredAt(
              animeRow.status,
              episodeNumber,
              animeRow.episodeCount ?? undefined,
              animeRow.startDate ?? undefined,
              animeRow.endDate ?? undefined,
            ),
            downloaded: true,
            filePath: file.path,
            title: null,
          }),
      );
      found += 1;
    }

    yield* tryDatabasePromise(
      "Failed to scan anime folder",
      () =>
        appendAnimeLog(
          db,
          "anime.folder.scanned",
          "success",
          `Scanned ${animeRow.titleRomaji} folder and found ${found} files`,
        ),
    );
    yield* eventBus.publish({
      type: "ScanFolderFinished",
      payload: { anime_id: animeId, found, title: animeRow.titleRomaji },
    });

    return { found, total: files.length };
  });

  const deleteAnime = Effect.fn("AnimeService.deleteAnime")(function* (
    id: number,
  ) {
    yield* tryDatabasePromise(
      "Failed to delete anime",
      () => db.delete(anime).where(eq(anime.id, id)),
    );
    yield* tryDatabasePromise(
      "Failed to delete anime",
      () =>
        appendAnimeLog(db, "anime.deleted", "success", `Deleted anime ${id}`),
    );
  });

  const updatePath = Effect.fn("AnimeService.updatePath")(function* (
    id: number,
    path: string,
  ) {
    yield* fs.mkdir(path, { recursive: true }).pipe(
      Effect.mapError((error) =>
        new DatabaseError({
          cause: error,
          message: "Failed to update anime path",
        })
      ),
    );
    yield* tryAnimePromise(
      "Failed to update anime path",
      () => requireAnimeExists(db, id),
    );
    yield* tryAnimePromise(
      "Failed to update anime path",
      () => db.update(anime).set({ rootFolder: path }).where(eq(anime.id, id)),
    );
    yield* tryDatabasePromise(
      "Failed to update anime path",
      () =>
        appendAnimeLog(
          db,
          "anime.path.updated",
          "success",
          `Updated path for anime ${id}`,
        ),
    );
  });

  const deleteEpisodeFile = Effect.fn("AnimeService.deleteEpisodeFile")(
    function* (animeId: number, episodeNumber: number) {
      const episodeRow = yield* tryAnimePromise(
        "Failed to delete episode file",
        () => getEpisodeRowOrThrow(db, animeId, episodeNumber),
      );

      if (episodeRow.filePath) {
        const filePath = episodeRow.filePath;
        yield* fs.remove(filePath).pipe(
          Effect.catchAll(() => Effect.void),
        );
      }

      yield* tryAnimePromise(
        "Failed to delete episode file",
        () =>
          db.update(episodes).set({ downloaded: false, filePath: null }).where(
            and(
              eq(episodes.animeId, animeId),
              eq(episodes.number, episodeNumber),
            ),
          ),
      );
    },
  );

  const mapEpisode = Effect.fn("AnimeService.mapEpisode")(function* (
    animeId: number,
    episodeNumber: number,
    filePath: string,
  ) {
    yield* tryAnimePromise(
      "Failed to map episode file",
      () => getAnimeRowOrThrow(db, animeId),
    );

    if (filePath.trim().length === 0) {
      yield* tryAnimePromise(
        "Failed to map episode file",
        () => clearEpisodeMapping(db, animeId, episodeNumber),
      );
      return;
    }

    yield* tryAnimePromise(
      "Failed to map episode file",
      () =>
        upsertEpisode(db, animeId, episodeNumber, {
          downloaded: true,
          filePath,
        }),
    );
  });

  const bulkMapEpisodes = Effect.fn("AnimeService.bulkMapEpisodes")(
    function* (
      animeId: number,
      mappings: readonly { episode_number: number; file_path: string }[],
    ) {
      yield* tryAnimePromise(
        "Failed to bulk-map episode files",
        () => getAnimeRowOrThrow(db, animeId),
      );

      for (const mapping of mappings) {
        if (mapping.file_path.trim().length === 0) {
          yield* tryAnimePromise(
            "Failed to bulk-map episode files",
            () => clearEpisodeMapping(db, animeId, mapping.episode_number),
          );
          continue;
        }

        yield* tryAnimePromise(
          "Failed to bulk-map episode files",
          () =>
            upsertEpisode(db, animeId, mapping.episode_number, {
              downloaded: true,
              filePath: mapping.file_path,
            }),
        );
      }
    },
  );

  const listFiles = Effect.fn("AnimeService.listFiles")(function* (
    animeId: number,
  ) {
    const animeRow = yield* tryAnimePromise(
      "Failed to list video files",
      () => getAnimeRowOrThrow(db, animeId),
    );
    const files = yield* collectVideoFiles(fs, animeRow.rootFolder).pipe(
      Effect.mapError((error) =>
        new DatabaseError({
          cause: error,
          message: "Failed to list video files",
        })
      ),
    );

    return files.map((file) => ({
      episode_number: parseEpisodeNumber(file.path),
      name: file.name,
      path: file.path,
      size: file.size,
    }));
  });

  const listAnime = Effect.fn("AnimeService.listAnime")(function* () {
    const animeRows = yield* tryDatabasePromise(
      "Failed to list anime",
      () => db.select().from(anime),
    );
    const episodeRows = yield* tryDatabasePromise(
      "Failed to list anime",
      () => db.select().from(episodes),
    );

    return animeRows.map((row) =>
      toAnimeDto(
        row,
        episodeRows.filter((episode) => episode.animeId === row.id),
      )
    );
  });

  const getAnime = Effect.fn("AnimeService.getAnime")(function* (id: number) {
    const row = yield* tryAnimePromise(
      "Failed to load anime",
      () => getAnimeRowOrThrow(db, id),
    );
    const episodeRows = yield* tryAnimePromise(
      "Failed to load anime",
      () => db.select().from(episodes).where(eq(episodes.animeId, id)),
    );

    return toAnimeDto(row, episodeRows);
  });

  const getAnimeByAnilistIdRaw = Effect.fn("AnimeService.getAnimeByAnilistId")(
    function* (id: number) {
      const metadata = yield* aniList.getAnimeMetadataById(id);

      if (!metadata) {
        yield* new AnimeNotFoundError({
          message: "Anime not found",
        });
      }

      const animeMetadata = metadata!;
      const existing = yield* tryAnimePromise(
        "Failed to fetch anime metadata",
        () =>
          db.select({ id: anime.id }).from(anime).where(eq(anime.id, id)).limit(
            1,
          ),
      );

      return {
        already_in_library: Boolean(existing[0]),
        cover_image: animeMetadata.coverImage,
        episode_count: animeMetadata.episodeCount,
        format: animeMetadata.format,
        id: animeMetadata.id,
        status: animeMetadata.status,
        title: animeMetadata.title,
      };
    },
  );

  const getAnimeByAnilistId: AnimeServiceShape["getAnimeByAnilistId"] = (id) =>
    getAnimeByAnilistIdRaw(id).pipe(
      Effect.catchAll((error) =>
        error instanceof AnimeNotFoundError ? Effect.fail(error) : Effect.fail(
          new AnimeNotFoundError({
            message: "Failed to fetch anime metadata",
          }),
        )
      ),
    );

  const listEpisodes = Effect.fn("AnimeService.listEpisodes")(function* (
    animeId: number,
  ) {
    const rows = yield* tryDatabasePromise(
      "Failed to list episodes",
      () => db.select().from(episodes).where(eq(episodes.animeId, animeId)),
    );

    return rows.sort((left, right) => left.number - right.number).map((
      row,
    ) => ({
      aired: row.aired ?? undefined,
      downloaded: row.downloaded,
      file_path: row.filePath ?? undefined,
      number: row.number,
      title: row.title ?? undefined,
    }));
  });

  return {
    listAnime,
    getAnime,
    searchAnime: (query) => aniList.searchAnimeMetadata(query),
    getAnimeByAnilistId,
    addAnime,
    deleteAnime,
    setMonitored: (id, monitored) =>
      updateAnimeRow(
        db,
        id,
        { monitored },
        `Anime ${id} monitoring updated`,
        eventBus,
      ),
    updatePath,
    updateProfile: (id, profileName) =>
      updateAnimeRow(
        db,
        id,
        { profileName },
        `Updated profile for anime ${id}`,
        eventBus,
      ),
    updateReleaseProfiles: (id, releaseProfileIds) =>
      updateAnimeRow(
        db,
        id,
        { releaseProfileIds: encodeNumberList(releaseProfileIds) },
        `Updated release profiles for anime ${id}`,
        eventBus,
      ),
    listEpisodes,
    refreshEpisodes,
    scanFolder,
    deleteEpisodeFile,
    mapEpisode,
    bulkMapEpisodes,
    listFiles,
  } satisfies AnimeServiceShape;
});

export const AnimeServiceLive = Layer.effect(AnimeService, makeAnimeService);

function wrapAnimeError(message: string) {
  return (cause: unknown) => {
    if (
      cause instanceof AnimeNotFoundError ||
      cause instanceof AnimeConflictError ||
      cause instanceof DatabaseError
    ) {
      return cause;
    }
    return new DatabaseError({ cause, message });
  };
}

function tryDatabasePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: (cause) => new DatabaseError({ cause, message }),
  });
}

function tryAnimePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, AnimeServiceError | DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: wrapAnimeError(message),
  });
}

function updateAnimeRow(
  db: AppDatabase,
  animeId: number,
  patch: Partial<typeof anime.$inferInsert>,
  message: string,
  eventBus: { publish: (event: NotificationEvent) => Effect.Effect<void> },
) {
  return Effect.fn("AnimeService.updateAnimeRow")(function* () {
    yield* tryAnimePromise(
      "Failed to update anime",
      () => requireAnimeExists(db, animeId),
    );
    yield* tryAnimePromise(
      "Failed to update anime",
      () => db.update(anime).set(patch).where(eq(anime.id, animeId)),
    );
    yield* tryDatabasePromise(
      "Failed to update anime",
      () => appendAnimeLog(db, "anime.updated", "success", message),
    );
    yield* eventBus.publish({ type: "Info", payload: { message } });
  })();
}
