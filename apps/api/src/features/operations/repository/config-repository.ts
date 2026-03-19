import type { Config } from "../../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../../db/database.ts";
import { appConfig, qualityProfiles } from "../../../db/schema.ts";
import {
  decodeQualityProfileRowOrThrow,
  decodeStoredConfigRowOrThrow,
  decodeStoredLibraryConfigOrThrow,
} from "../../system/config-codec.ts";
import type { NamingSettings } from "./types.ts";

export async function loadRuntimeConfig(db: AppDatabase): Promise<Config> {
  const rows = await db.select().from(appConfig).limit(1);
  const core = decodeStoredConfigRowOrThrow(rows[0]);
  const profileRows = await db.select().from(qualityProfiles);

  return {
    ...core,
    profiles: profileRows.map(decodeQualityProfileRowOrThrow),
  };
}

export async function getConfigLibraryPath(db: AppDatabase) {
  const rows = await db.select().from(appConfig).limit(1);

  return decodeStoredLibraryConfigOrThrow(rows[0]).library_path;
}

export async function currentImportMode(db: AppDatabase) {
  const rows = await db.select().from(appConfig).limit(1);

  return decodeStoredLibraryConfigOrThrow(rows[0]).import_mode;
}

export async function currentNamingSettings(
  db: AppDatabase,
): Promise<NamingSettings> {
  const rows = await db.select().from(appConfig).limit(1);
  const library = decodeStoredLibraryConfigOrThrow(rows[0]);

  return {
    movieNamingFormat: library.movie_naming_format,
    namingFormat: library.naming_format,
    preferredTitle: library.preferred_title,
  };
}
