import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { QualityProfile, ReleaseProfileRule } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { qualityProfiles, releaseProfiles } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  decodeNumberList,
  decodeQualityProfileRow,
  decodeReleaseProfileRules,
} from "@/features/system/config-codec.ts";

const mapDecodeError = (message: string) =>
  Effect.mapError((cause: unknown) =>
    cause instanceof DatabaseError ? cause : new DatabaseError({ message, cause }),
  );

export const loadQualityProfile = Effect.fn("ProfileRepository.loadQualityProfile")(function* (
  db: AppDatabase,
  name: string,
) {
  const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
    db.select().from(qualityProfiles).where(eq(qualityProfiles.name, name)).limit(1),
  );

  if (!rows[0]) {
    return Option.none<QualityProfile>();
  }

  return yield* decodeQualityProfileRow(rows[0]).pipe(
    mapDecodeError("Failed to load quality profile"),
    Effect.map((profile) => Option.some(profile)),
  );
});

export const loadReleaseRules = Effect.fn("ProfileRepository.loadReleaseRules")(function* (
  db: AppDatabase,
  animeRow: { releaseProfileIds: string },
) {
  const assignedIds = yield* decodeNumberList(animeRow.releaseProfileIds).pipe(
    mapDecodeError("Failed to load release rules"),
  );

  const rows = yield* tryDatabasePromise("Failed to load release rules", () =>
    db.select().from(releaseProfiles),
  );

  const decodedRules = yield* Effect.forEach(
    rows.filter((row) => row.enabled && (row.isGlobal || assignedIds.includes(row.id))),
    (row) =>
      decodeReleaseProfileRules(row.rules).pipe(mapDecodeError("Failed to load release rules")),
  );

  return decodedRules.flat() as readonly ReleaseProfileRule[];
});
