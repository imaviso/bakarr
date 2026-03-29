import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { appConfig } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { effectDecodeConfigCore, effectDecodeImagePath } from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import { AnimeStoredDataError } from "./errors.ts";

export const resolveAnimeRootFolderEffect = Effect.fn("AnimeConfigSupport.resolveAnimeRootFolder")(
  function* (
    db: AppDatabase,
    requestedRootFolder: string,
    title: string,
    options: { readonly useExistingRoot?: boolean } = {},
  ) {
    const trimmed = requestedRootFolder.trim();
    const rows = yield* tryDatabasePromise("Failed to resolve anime root folder", () =>
      db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
    );
    const configCore = rows[0]
      ? yield* effectDecodeConfigCore(rows[0].data).pipe(
          Effect.mapError(
            () =>
              new AnimeStoredDataError({
                message: "Stored anime configuration is corrupt",
              }),
          ),
        )
      : makeDefaultConfig(":memory:");
    const settings = toLibrarySettings(configCore);
    const baseRootFolder = trimmed.length > 0 ? trimmed : settings.libraryPath;

    if (options.useExistingRoot && trimmed.length > 0) {
      return trimmed;
    }

    if (!settings.createAnimeFolders) {
      return baseRootFolder;
    }

    const safeSegment = toSafePathSegment(title);

    if (baseRootFolder.split("/").filter(Boolean).pop() === safeSegment) {
      return baseRootFolder;
    }

    return `${baseRootFolder.replace(/\/$/, "")}/${safeSegment}`;
  },
);

export const getConfiguredImagesPathEffect = Effect.fn(
  "AnimeConfigSupport.getConfiguredImagesPath",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise("Failed to load configured images path", () =>
    db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
  );

  return yield* effectDecodeImagePath(rows[0]).pipe(
    Effect.mapError(
      () =>
        new AnimeStoredDataError({
          message: "Stored anime image path configuration is corrupt",
        }),
    ),
  );
});

export const getConfiguredLibraryPathEffect = Effect.fn(
  "AnimeConfigSupport.getConfiguredLibraryPath",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise("Failed to load configured library path", () =>
    db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
  );

  const configCore = rows[0]
    ? yield* effectDecodeConfigCore(rows[0].data).pipe(
        Effect.mapError(
          () =>
            new AnimeStoredDataError({
              message: "Stored anime configuration is corrupt",
            }),
        ),
      )
    : makeDefaultConfig(":memory:");

  return toLibrarySettings(configCore).libraryPath;
});

function toLibrarySettings(config: {
  downloads: { create_anime_folders: boolean };
  library: { library_path: string };
}) {
  return {
    createAnimeFolders: config.downloads.create_anime_folders,
    libraryPath: config.library.library_path.trim() || "./library",
  };
}

function toSafePathSegment(value: string) {
  return (
    value
      .replace(/[<>:"/\\|?*]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "anime"
  );
}
