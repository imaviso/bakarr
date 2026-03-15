import { and, eq } from "drizzle-orm";
import { HttpClient } from "@effect/platform";
import { Context, Effect, Layer } from "effect";

import type {
  Anime,
  AnimeSearchResult,
  Episode,
  VideoFile,
} from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import { EventPublisher } from "../events/publisher.ts";
import { AniListClient } from "./anilist.ts";
import { cacheAnimeMetadataImages } from "./image-cache.ts";
import { encodeNumberList, encodeStringList } from "../system/config-codec.ts";
import { toAnimeDto } from "./dto.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  type AnimeServiceError,
} from "./errors.ts";
import { ProfileNotFoundError } from "../system/errors.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { collectVideoFiles, parseEpisodeNumber } from "./files.ts";
import { FileSystem, isWithinPathRoot } from "../../lib/filesystem.ts";
import {
  appendAnimeLog,
  buildMissingEpisodeRows,
  clearEpisodeMapping,
  ensureEpisodes,
  findAnimeRootFolderOwner,
  getAnimeRowOrThrow,
  getConfiguredImagesPath,
  getEpisodeRowOrThrow,
  inferAiredAt,
  insertAnimeAggregateAtomic,
  markSearchResultsAlreadyInLibrary,
  qualityProfileExists,
  requireAnimeExists,
  resolveAnimeRootFolder,
  upsertEpisode,
} from "./repository.ts";
import {
  tryAnimePromise,
  tryDatabasePromise,
  updateAnimeRow,
} from "./service-support.ts";

export interface AddAnimeInput {
  readonly id: number;
  readonly profile_name: string;
  readonly root_folder: string;
  readonly monitor_and_search: boolean;
  readonly monitored: boolean;
  readonly release_profile_ids: number[];
  readonly use_existing_root?: boolean;
}

export interface AnimeServiceShape {
  readonly listAnime: () => Effect.Effect<Anime[], DatabaseError>;
  readonly getAnime: (
    id: number,
  ) => Effect.Effect<Anime, AnimeServiceError | DatabaseError>;
  readonly searchAnime: (
    query: string,
  ) => Effect.Effect<AnimeSearchResult[], DatabaseError | ExternalCallError>;
  readonly getAnimeByAnilistId: (
    id: number,
  ) => Effect.Effect<
    AnimeSearchResult,
    AnimeNotFoundError | DatabaseError | ExternalCallError
  >;
  readonly addAnime: (
    input: AddAnimeInput,
  ) => Effect.Effect<
    Anime,
    | AnimeNotFoundError
    | AnimeConflictError
    | AnimePathError
    | ProfileNotFoundError
    | DatabaseError
    | ExternalCallError
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
  ) => Effect.Effect<
    void,
    AnimeServiceError | DatabaseError | ProfileNotFoundError
  >;
  readonly updateReleaseProfiles: (
    id: number,
    releaseProfileIds: number[],
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly listEpisodes: (
    animeId: number,
  ) => Effect.Effect<Episode[], DatabaseError>;
  readonly resolveEpisodeFile: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<
    { fileName: string; filePath: string } | null,
    AnimeServiceError | DatabaseError
  >;
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
  const eventPublisher = yield* EventPublisher;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const httpClient = yield* HttpClient.HttpClient;

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
      return yield* new AnimeConflictError({
        message: "Anime already exists",
      });
    }

    const metadata = yield* aniList.getAnimeMetadataById(input.id);

    if (!metadata) {
      return yield* new AnimeNotFoundError({
        message: "Anime not found",
      });
    }

    const animeMetadata = metadata!;

    const profileExists = yield* tryDatabasePromise(
      "Failed to add anime",
      () => qualityProfileExists(db, input.profile_name),
    );

    if (!profileExists) {
      return yield* new ProfileNotFoundError({
        message: `Quality profile '${input.profile_name}' not found`,
      });
    }

    const rootFolder = yield* tryAnimePromise(
      "Failed to add anime",
      () =>
        resolveAnimeRootFolder(
          db,
          input.root_folder,
          animeMetadata.title.romaji,
          { useExistingRoot: input.use_existing_root },
        ),
    );

    const existingRootOwner = yield* tryDatabasePromise(
      "Failed to add anime",
      () => findAnimeRootFolderOwner(db, rootFolder),
    );

    if (existingRootOwner) {
      return yield* new AnimeConflictError({
        message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
      });
    }

    yield* fs.mkdir(rootFolder, { recursive: true }).pipe(
      Effect.mapError((error) =>
        new DatabaseError({ cause: error, message: "Failed to add anime" })
      ),
    );

    const imagesPath = yield* tryAnimePromise(
      "Failed to add anime",
      () => getConfiguredImagesPath(db),
    );
    const cachedImages = yield* cacheAnimeMetadataImages(
      fs,
      httpClient,
      imagesPath,
      animeMetadata.id,
      {
        bannerImage: animeMetadata.bannerImage,
        coverImage: animeMetadata.coverImage,
      },
    ).pipe(
      Effect.catchAllCause(() =>
        Effect.succeed({
          bannerImage: animeMetadata.bannerImage,
          coverImage: animeMetadata.coverImage,
        })
      ),
    );

    const animeRow = {
      addedAt: new Date().toISOString(),
      bannerImage: cachedImages.bannerImage ?? null,
      coverImage: cachedImages.coverImage ?? null,
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

    const episodeRows = buildMissingEpisodeRows({
      animeId: animeRow.id,
      episodeCount: animeMetadata.episodeCount,
      endDate: animeMetadata.endDate ?? undefined,
      existingRows: [],
      resetMissingOnly: true,
      startDate: animeMetadata.startDate ?? undefined,
      status: animeMetadata.status,
    });

    yield* tryDatabasePromise(
      "Failed to add anime",
      () =>
        insertAnimeAggregateAtomic(db, {
          animeRow,
          episodeRows,
          log: {
            createdAt: new Date().toISOString(),
            details: null,
            eventType: "anime.created",
            level: "success",
            message: `Added ${animeRow.titleRomaji} to library`,
          },
        }),
    );

    yield* eventPublisher.publishInfo(
      `Added ${animeRow.titleRomaji} to library`,
    );

    const persistedEpisodeRows = yield* tryDatabasePromise(
      "Failed to add anime",
      () => db.select().from(episodes).where(eq(episodes.animeId, animeRow.id)),
    );

    return toAnimeDto(animeRow, persistedEpisodeRows);
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
    yield* eventPublisher.publish({
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
    yield* eventPublisher.publish({
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
    const trimmedPath = path.trim();
    yield* tryAnimePromise(
      "Failed to update anime path",
      () => requireAnimeExists(db, id),
    );

    yield* fs.mkdir(trimmedPath, { recursive: true }).pipe(
      Effect.mapError((error) =>
        new DatabaseError({
          cause: error,
          message: "Failed to update anime path",
        })
      ),
    );

    const canonicalPath = yield* fs.realPath(trimmedPath).pipe(
      Effect.mapError(() =>
        new AnimePathError({
          message: "Path does not exist or is inaccessible",
        })
      ),
    );

    const existingRootOwner = yield* tryDatabasePromise(
      "Failed to update anime path",
      () => findAnimeRootFolderOwner(db, canonicalPath),
    );

    if (existingRootOwner && existingRootOwner.id !== id) {
      return yield* new AnimeConflictError({
        message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
      });
    }

    yield* tryAnimePromise(
      "Failed to update anime path",
      () =>
        db.update(anime).set({ rootFolder: canonicalPath }).where(
          eq(anime.id, id),
        ),
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
      const animeRow = yield* tryAnimePromise(
        "Failed to delete episode file",
        () => getAnimeRowOrThrow(db, animeId),
      );
      const episodeRow = yield* tryAnimePromise(
        "Failed to delete episode file",
        () => getEpisodeRowOrThrow(db, animeId, episodeNumber),
      );

      if (episodeRow.filePath) {
        const filePath = episodeRow.filePath;
        const resolvedPathResult = yield* Effect.either(
          fs.realPath(filePath),
        );

        if (resolvedPathResult._tag === "Right") {
          const resolvedPath = resolvedPathResult.right;
          const animeRoot = yield* fs.realPath(animeRow.rootFolder).pipe(
            Effect.mapError(() =>
              new AnimePathError({
                message: "Anime root folder does not exist",
              })
            ),
          );

          if (!isWithinPathRoot(resolvedPath, animeRoot)) {
            return yield* new AnimePathError({
              message: "File path is not within the anime root folder",
            });
          }

          yield* fs.remove(filePath).pipe(
            Effect.mapError(() =>
              new AnimePathError({
                message: "Failed to delete episode file from disk",
              })
            ),
          );
        }
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
    const animeRow = yield* tryAnimePromise(
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

    const resolvedPath = yield* fs.realPath(filePath).pipe(
      Effect.mapError(() =>
        new AnimePathError({
          message: "File path does not exist or is inaccessible",
        })
      ),
    );

    const animeRootResult = yield* fs.realPath(animeRow.rootFolder).pipe(
      Effect.either,
    );

    if (animeRootResult._tag === "Left") {
      return yield* new AnimePathError({
        message: "Anime root folder does not exist",
      });
    }

    if (!isWithinPathRoot(resolvedPath, animeRootResult.right)) {
      return yield* new AnimePathError({
        message: "File path is not within the anime root folder",
      });
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
      const animeRow = yield* tryAnimePromise(
        "Failed to bulk-map episode files",
        () => getAnimeRowOrThrow(db, animeId),
      );

      const animeRoot = yield* fs.realPath(animeRow.rootFolder).pipe(
        Effect.mapError(() =>
          new AnimePathError({
            message: "Anime root folder does not exist",
          })
        ),
      );

      const validated: {
        episode_number: number;
        file_path: string;
        clear: boolean;
      }[] = [];

      for (const mapping of mappings) {
        if (mapping.file_path.trim().length === 0) {
          validated.push({
            episode_number: mapping.episode_number,
            file_path: "",
            clear: true,
          });
          continue;
        }

        const resolvedPath = yield* fs.realPath(mapping.file_path).pipe(
          Effect.mapError(() =>
            new AnimePathError({
              message: "File path does not exist or is inaccessible",
            })
          ),
        );

        if (!isWithinPathRoot(resolvedPath, animeRoot)) {
          return yield* new AnimePathError({
            message:
              `File path for episode ${mapping.episode_number} is not within the anime root folder`,
          });
        }

        validated.push({
          episode_number: mapping.episode_number,
          file_path: mapping.file_path,
          clear: false,
        });
      }

      for (const entry of validated) {
        if (entry.clear) {
          yield* tryAnimePromise(
            "Failed to bulk-map episode files",
            () => clearEpisodeMapping(db, animeId, entry.episode_number),
          );
        } else {
          yield* tryAnimePromise(
            "Failed to bulk-map episode files",
            () =>
              upsertEpisode(db, animeId, entry.episode_number, {
                downloaded: true,
                filePath: entry.file_path,
              }),
          );
        }
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
    const episodesByAnimeId = new Map<
      number,
      Array<typeof episodes.$inferSelect>
    >();

    for (const episodeRow of episodeRows) {
      const bucket = episodesByAnimeId.get(episodeRow.animeId);

      if (bucket) {
        bucket.push(episodeRow);
      } else {
        episodesByAnimeId.set(episodeRow.animeId, [episodeRow]);
      }
    }

    return animeRows.map((row) =>
      toAnimeDto(
        row,
        episodesByAnimeId.get(row.id) ?? [],
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
        return yield* new AnimeNotFoundError({
          message: "Anime not found",
        });
      }

      const animeMetadata = metadata!;
      const existing = yield* tryDatabasePromise(
        "Failed to check library status",
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
    getAnimeByAnilistIdRaw(id);

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

  const resolveEpisodeFile = Effect.fn("AnimeService.resolveEpisodeFile")(
    function* (animeId: number, episodeNumber: number) {
      const animeRow = yield* tryAnimePromise(
        "Failed to resolve episode file",
        () => getAnimeRowOrThrow(db, animeId),
      );
      const episodeRow = yield* tryAnimePromise(
        "Failed to resolve episode file",
        () => getEpisodeRowOrThrow(db, animeId, episodeNumber),
      );

      if (!episodeRow.filePath) {
        return null;
      }

      const animeRootResult = yield* Effect.either(
        fs.realPath(animeRow.rootFolder),
      );

      if (animeRootResult._tag === "Left") {
        return null;
      }

      const filePathResult = yield* Effect.either(
        fs.realPath(episodeRow.filePath),
      );

      if (filePathResult._tag === "Left") {
        return null;
      }

      const filePath = filePathResult.right;

      if (!isWithinPathRoot(filePath, animeRootResult.right)) {
        return null;
      }

      return {
        fileName: filePath.split("/").pop() ?? `episode-${episodeNumber}`,
        filePath,
      };
    },
  );

  const updateProfile = Effect.fn("AnimeService.updateProfile")(function* (
    id: number,
    profileName: string,
  ) {
    const profileExists = yield* tryDatabasePromise(
      "Failed to update anime profile",
      () => qualityProfileExists(db, profileName),
    );

    if (!profileExists) {
      return yield* new ProfileNotFoundError({
        message: `Quality profile '${profileName}' not found`,
      });
    }

    yield* updateAnimeRow(
      db,
      id,
      { profileName },
      `Updated profile for anime ${id}`,
      eventPublisher,
    );
  });

  return {
    listAnime,
    getAnime,
    searchAnime: (query) =>
      aniList.searchAnimeMetadata(query).pipe(
        Effect.flatMap((results) =>
          tryDatabasePromise(
            "Failed to check library status",
            () => markSearchResultsAlreadyInLibrary(db, results),
          )
        ),
      ),
    getAnimeByAnilistId,
    addAnime,
    deleteAnime,
    setMonitored: (id, monitored) =>
      updateAnimeRow(
        db,
        id,
        { monitored },
        `Anime ${id} monitoring updated`,
        eventPublisher,
      ),
    updatePath,
    updateProfile,
    updateReleaseProfiles: (id, releaseProfileIds) =>
      updateAnimeRow(
        db,
        id,
        { releaseProfileIds: encodeNumberList(releaseProfileIds) },
        `Updated release profiles for anime ${id}`,
        eventPublisher,
      ),
    listEpisodes,
    resolveEpisodeFile,
    refreshEpisodes,
    scanFolder,
    deleteEpisodeFile,
    mapEpisode,
    bulkMapEpisodes,
    listFiles,
  } satisfies AnimeServiceShape;
});

export const AnimeServiceLive = Layer.effect(AnimeService, makeAnimeService);
