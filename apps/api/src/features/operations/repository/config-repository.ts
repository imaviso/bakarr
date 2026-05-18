import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { appConfig, qualityProfiles } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  composeConfig,
  decodeStoredConfigRow,
  decodeStoredLibraryConfig,
} from "@/features/system/config-codec.ts";
import { decodeQualityProfileRow } from "@/features/profiles/profile-codec.ts";
import type { NamingSettings } from "@/features/operations/repository/types.ts";
import { MEDIA_KIND_VALUES, type MediaKind } from "@packages/shared/index.ts";
import { getLibraryPathForMediaKind } from "@/features/media/shared/config-support.ts";

const mapConfigError = (message: string) =>
  Effect.mapError((cause: unknown) =>
    cause instanceof DatabaseError ? cause : new DatabaseError({ message, cause }),
  );

export const loadRuntimeConfig = Effect.fn("ConfigRepository.loadRuntimeConfig")(function* (
  db: AppDatabase,
) {
  const rows = yield* tryDatabasePromise("Failed to load runtime config", () =>
    db.select().from(appConfig).limit(1),
  );
  const core = yield* decodeStoredConfigRow(rows[0]).pipe(
    mapConfigError("Failed to load runtime config"),
  );
  const profileRows = yield* tryDatabasePromise("Failed to load runtime config", () =>
    db.select().from(qualityProfiles),
  );
  const profiles = yield* Effect.forEach(profileRows, (row) =>
    decodeQualityProfileRow(row).pipe(mapConfigError("Failed to load runtime config")),
  );

  return yield* composeConfig(core, profiles).pipe(mapConfigError("Failed to load runtime config"));
});

export const getConfigLibraryRoots = Effect.fn("ConfigRepository.getConfigLibraryRoots")(function* (
  db: AppDatabase,
) {
  const rows = yield* tryDatabasePromise("Failed to load config library paths", () =>
    db.select().from(appConfig).limit(1),
  );
  const library = yield* decodeStoredLibraryConfig(rows[0]).pipe(
    mapConfigError("Failed to load config library paths"),
  );

  return MEDIA_KIND_VALUES.map((mediaKind) => ({
    mediaKind,
    path: getLibraryPathForMediaKind(library, mediaKind),
  }));
});

export const getConfigLibraryPath = Effect.fn("ConfigRepository.getConfigLibraryPath")(function* (
  db: AppDatabase,
  mediaKind: MediaKind = "anime",
) {
  const roots = yield* getConfigLibraryRoots(db);
  return roots.find((root) => root.mediaKind === mediaKind)?.path ?? "./library/anime";
});

export const currentImportMode = Effect.fn("ConfigRepository.currentImportMode")(function* (
  db: AppDatabase,
) {
  const rows = yield* tryDatabasePromise("Failed to load current import mode", () =>
    db.select().from(appConfig).limit(1),
  );
  const library = yield* decodeStoredLibraryConfig(rows[0]).pipe(
    mapConfigError("Failed to load current import mode"),
  );

  return library.import_mode;
});

export const currentNamingSettings = Effect.fn("ConfigRepository.currentNamingSettings")(function* (
  db: AppDatabase,
) {
  const rows = yield* tryDatabasePromise("Failed to load naming settings", () =>
    db.select().from(appConfig).limit(1),
  );
  const library = yield* decodeStoredLibraryConfig(rows[0]).pipe(
    mapConfigError("Failed to load naming settings"),
  );

  return {
    movieNamingFormat: library.movie_naming_format,
    namingFormat: library.naming_format,
    preferredTitle: library.preferred_title,
  } satisfies NamingSettings;
});
