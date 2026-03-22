import { Effect, Either } from "effect";

import type { Config } from "../../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../../db/database.ts";
import { appConfig, qualityProfiles } from "../../../db/schema.ts";
import {
  effectDecodeQualityProfileRow,
  effectDecodeStoredConfigRow,
  effectDecodeStoredLibraryConfig,
} from "../../system/config-codec.ts";
import type { NamingSettings } from "./types.ts";

function runDecodeOrThrow<A, E>(effect: Effect.Effect<A, E>) {
  const decoded = Effect.runSync(Effect.either(effect));

  if (Either.isLeft(decoded)) {
    throw decoded.left;
  }

  return decoded.right;
}

export async function loadRuntimeConfig(db: AppDatabase): Promise<Config> {
  const rows = await db.select().from(appConfig).limit(1);
  const core = runDecodeOrThrow(effectDecodeStoredConfigRow(rows[0]));
  const profileRows = await db.select().from(qualityProfiles);
  const profiles = profileRows.map((row) =>
    runDecodeOrThrow(effectDecodeQualityProfileRow(row))
  );

  return {
    ...core,
    profiles,
  };
}

export async function getConfigLibraryPath(db: AppDatabase) {
  const rows = await db.select().from(appConfig).limit(1);
  const library = runDecodeOrThrow(effectDecodeStoredLibraryConfig(rows[0]));

  return library.library_path;
}

export async function currentImportMode(db: AppDatabase) {
  const rows = await db.select().from(appConfig).limit(1);
  const library = runDecodeOrThrow(effectDecodeStoredLibraryConfig(rows[0]));

  return library.import_mode;
}

export async function currentNamingSettings(
  db: AppDatabase,
): Promise<NamingSettings> {
  const rows = await db.select().from(appConfig).limit(1);
  const library = runDecodeOrThrow(effectDecodeStoredLibraryConfig(rows[0]));

  return {
    movieNamingFormat: library.movie_naming_format,
    namingFormat: library.naming_format,
    preferredTitle: library.preferred_title,
  };
}
