import { eq } from "drizzle-orm";

import type {
  QualityProfile,
  ReleaseProfileRule,
} from "../../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../../db/database.ts";
import { qualityProfiles, releaseProfiles } from "../../../db/schema.ts";
import {
  decodeNumberListOrThrow,
  decodeQualityProfileRowOrThrow,
  decodeReleaseProfileRulesOrThrow,
} from "../../system/config-codec.ts";

export async function loadQualityProfile(
  db: AppDatabase,
  name: string,
): Promise<QualityProfile | null> {
  const rows = await db.select().from(qualityProfiles).where(
    eq(qualityProfiles.name, name),
  ).limit(1);

  if (!rows[0]) {
    return null;
  }

  return decodeQualityProfileRowOrThrow(rows[0]);
}

export async function loadReleaseRules(
  db: AppDatabase,
  animeRow: { releaseProfileIds: string },
): Promise<readonly ReleaseProfileRule[]> {
  const assignedIds = decodeNumberListOrThrow(animeRow.releaseProfileIds);
  const rows = await db.select().from(releaseProfiles);
  return rows
    .filter((row) =>
      row.enabled && (row.isGlobal || assignedIds.includes(row.id))
    )
    .flatMap((row) => decodeReleaseProfileRulesOrThrow(row.rules));
}
