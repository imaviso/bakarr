import { Effect } from "effect";

import type { Config } from "../../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../../db/database.ts";
import { DatabaseError } from "../../../db/database.ts";
import { appConfig, qualityProfiles } from "../../../db/schema.ts";
import { tryDatabasePromise } from "../../../lib/effect-db.ts";
import {
  effectDecodeQualityProfileRow,
  effectDecodeStoredConfigRow,
  effectDecodeStoredLibraryConfig,
} from "../../system/config-codec.ts";
import type { NamingSettings } from "./types.ts";

const mapConfigError = (message: string) =>
  Effect.mapError((cause: unknown) =>
    cause instanceof DatabaseError
      ? cause
      : new DatabaseError({ message, cause })
  );

export const loadRuntimeConfig = Effect.fn(
  "ConfigRepository.loadRuntimeConfig",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise(
    "Failed to load runtime config",
    () => db.select().from(appConfig).limit(1),
  );
  const core = yield* effectDecodeStoredConfigRow(rows[0]).pipe(
    mapConfigError("Failed to load runtime config"),
  );
  const profileRows = yield* tryDatabasePromise(
    "Failed to load runtime config",
    () => db.select().from(qualityProfiles),
  );
  const profiles = yield* Effect.forEach(
    profileRows,
    (row) =>
      effectDecodeQualityProfileRow(row).pipe(
        mapConfigError("Failed to load runtime config"),
      ),
  );

  return {
    ...core,
    profiles: [...profiles],
  } satisfies Config;
});

export const getConfigLibraryPath = Effect.fn(
  "ConfigRepository.getConfigLibraryPath",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise(
    "Failed to load config library path",
    () => db.select().from(appConfig).limit(1),
  );
  const library = yield* effectDecodeStoredLibraryConfig(rows[0]).pipe(
    mapConfigError("Failed to load config library path"),
  );

  return library.library_path;
});

export const currentImportMode = Effect.fn(
  "ConfigRepository.currentImportMode",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise(
    "Failed to load current import mode",
    () => db.select().from(appConfig).limit(1),
  );
  const library = yield* effectDecodeStoredLibraryConfig(rows[0]).pipe(
    mapConfigError("Failed to load current import mode"),
  );

  return library.import_mode;
});

export const currentNamingSettings = Effect.fn(
  "ConfigRepository.currentNamingSettings",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise(
    "Failed to load naming settings",
    () => db.select().from(appConfig).limit(1),
  );
  const library = yield* effectDecodeStoredLibraryConfig(rows[0]).pipe(
    mapConfigError("Failed to load naming settings"),
  );

  return {
    movieNamingFormat: library.movie_naming_format,
    namingFormat: library.naming_format,
    preferredTitle: library.preferred_title,
  } satisfies NamingSettings;
});
