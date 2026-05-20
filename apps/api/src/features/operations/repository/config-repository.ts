import { Context, Effect, Layer } from "effect";
import { asc } from "drizzle-orm";

import { Database, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { appConfig, libraryRoots, qualityProfiles } from "@/db/schema.ts";
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

export interface OperationsConfigRepositoryShape {
  readonly loadRuntimeConfig: () => ReturnType<typeof loadRuntimeConfig>;
  readonly getConfigLibraryRoots: () => ReturnType<typeof getConfigLibraryRoots>;
  readonly getConfigLibraryPath: (mediaKind?: MediaKind) => ReturnType<typeof getConfigLibraryPath>;
  readonly listLibraryRoots: () => ReturnType<typeof listLibraryRoots>;
  readonly currentImportMode: () => ReturnType<typeof currentImportMode>;
  readonly currentNamingSettings: () => ReturnType<typeof currentNamingSettings>;
}

export class OperationsConfigRepository extends Context.Tag(
  "@bakarr/api/OperationsConfigRepository",
)<OperationsConfigRepository, OperationsConfigRepositoryShape>() {}

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

export const listLibraryRoots = Effect.fn("ConfigRepository.listLibraryRoots")(function* (
  db: AppDatabase,
) {
  const rows = yield* tryDatabasePromise("Failed to load library roots", () =>
    db
      .select({
        id: libraryRoots.id,
        label: libraryRoots.label,
        path: libraryRoots.path,
      })
      .from(libraryRoots)
      .orderBy(asc(libraryRoots.label)),
  );

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    path: row.path,
  }));
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

export function makeOperationsConfigRepository(db: AppDatabase): OperationsConfigRepositoryShape {
  return OperationsConfigRepository.of({
    currentImportMode: () => currentImportMode(db),
    currentNamingSettings: () => currentNamingSettings(db),
    getConfigLibraryPath: (mediaKind) => getConfigLibraryPath(db, mediaKind),
    getConfigLibraryRoots: () => getConfigLibraryRoots(db),
    listLibraryRoots: () => listLibraryRoots(db),
    loadRuntimeConfig: () => loadRuntimeConfig(db),
  });
}

export const OperationsConfigRepositoryLive = Layer.effect(
  OperationsConfigRepository,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeOperationsConfigRepository(db);
  }),
);
