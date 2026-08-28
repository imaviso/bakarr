import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Cause, Effect, Option, Schema } from "effect";

import * as schema from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  downloads,
  media,
  appConfig,
  mediaUnits,
  qualityProfiles,
  releaseProfiles,
} from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { encodeConfigCore } from "@/features/system/config-codec.ts";
import {
  encodeNumberList,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "@/features/system/profile-codec.ts";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import {
  decodeDownloadSourceMetadata,
  encodeDownloadSourceMetadata,
} from "@/features/operations/repository/download-row-codec.ts";
import { makeDownloadRepository, makeMediaRepository } from "@/test/repository-factories.ts";
import { loadQualityProfile } from "@/features/system/repository/quality-profile-repository.ts";
import { loadReleaseRules } from "@/features/system/repository/release-profile-repository.ts";
import { MediaNotFoundError } from "@/features/media/errors.ts";

it.scoped("operations repository helpers load profile settings", () =>
  withSqliteTestDbEffect({
    run: (db, databaseFile) =>
      Effect.gen(function* () {
        const defaults = makeDefaultConfig(databaseFile);
        const encodedDefaults = yield* Schema.encode(ConfigCoreSchema)(defaults);
        const decodedConfig = yield* Schema.decodeUnknown(ConfigCoreSchema)({
          ...encodedDefaults,
          library: {
            ...encodedDefaults.library,
            import_mode: "move",
            anime_path: "/media-library",
            manga_path: "/media-library/manga",
            light_novel_path: "/media-library/light-novels",
          },
        });
        const configData = yield* encodeConfigCore(decodedConfig);
        const qualityProfileRow = yield* encodeQualityProfileRow({
          allowed_qualities: ["1080p", "720p"],
          cutoff: "1080p",
          max_size: "4GB",
          min_size: null,
          name: "Default",
          seadex_preferred: true,
          upgrade_allowed: true,
        });

        yield* tryDatabasePromise("Failed to seed appConfig for operations test", () =>
          db.insert(appConfig).values({
            id: 1,
            data: configData,
            updatedAt: "2024-01-01T00:00:00.000Z",
          }),
        );
        yield* tryDatabasePromise("Failed to seed qualityProfiles for operations test", () =>
          db.insert(qualityProfiles).values(qualityProfileRow),
        );

        const storedProfile = yield* loadQualityProfile(db, "Default");
        assert.deepStrictEqual(storedProfile._tag, "Some");
        if (storedProfile._tag === "Some") {
          assert.deepStrictEqual(storedProfile.value.max_size, "4GB");
        }

        const fallbackProfile = yield* loadQualityProfile(db, "Missing");
        assert.deepStrictEqual(fallbackProfile, Option.none());
      }),
    schema,
  }),
);

it.scoped("operations repository helpers load media release rules and episode state", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile) =>
      Effect.gen(function* () {
        const releaseProfileIds = yield* encodeNumberList([2]);
        const globalRules = yield* encodeReleaseProfileRules([
          { rule_type: "preferred", score: 10, term: "SubsPlease" },
        ]);
        const assignedRules = yield* encodeReleaseProfileRules([
          { rule_type: "must", score: 0, term: "1080p" },
        ]);
        const ignoredRules = yield* encodeReleaseProfileRules([
          { rule_type: "must_not", score: 0, term: "Dub" },
        ]);

        yield* tryDatabasePromise("Failed to seed media for release rules test", () =>
          db.insert(media).values({
            id: 20,
            malId: null,
            titleRomaji: "Naruto",
            titleEnglish: "Naruto",
            titleNative: null,
            format: "TV",
            description: null,
            score: null,
            genres: "[]",
            studios: "[]",
            coverImage: null,
            bannerImage: null,
            status: "RELEASING",
            unitCount: 12,
            startDate: null,
            endDate: null,
            startYear: null,
            endYear: null,
            nextAiringAt: null,
            nextAiringUnit: null,
            profileName: "Default",
            rootFolder: "/library/Naruto",
            addedAt: "2024-01-01T00:00:00.000Z",
            monitored: true,
            releaseProfileIds,
          }),
        );
        yield* tryDatabasePromise("Failed to seed releaseProfiles for release rules test", () =>
          db.insert(releaseProfiles).values([
            {
              id: 1,
              name: "Global",
              enabled: true,
              isGlobal: true,
              rules: globalRules,
            },
            {
              id: 2,
              name: "Assigned",
              enabled: true,
              isGlobal: false,
              rules: assignedRules,
            },
            {
              id: 3,
              name: "Ignored",
              enabled: true,
              isGlobal: false,
              rules: ignoredRules,
            },
          ]),
        );
        yield* tryDatabasePromise("Failed to seed mediaUnits for release rules test", () =>
          db.insert(mediaUnits).values({
            mediaId: 20,
            number: 1,
            title: null,
            aired: null,
            downloaded: true,
            filePath: "/library/Naruto/Naruto - 01.mkv",
          }),
        );

        const mediaRepository = makeMediaRepository(db);
        const animeRow = yield* mediaRepository.getMediaRow(20);
        assert.deepStrictEqual(animeRow.titleRomaji, "Naruto");

        const releaseRules = yield* loadReleaseRules(db, animeRow);
        assert.deepStrictEqual(releaseRules, [
          { rule_type: "preferred", score: 10, term: "SubsPlease" },
          { rule_type: "must", score: 0, term: "1080p" },
        ]);

        const episodeState = yield* mediaRepository.loadCurrentUnitState(20, 1);
        assert.deepStrictEqual(episodeState._tag, "Some");
        if (episodeState._tag === "Some") {
          assert.deepStrictEqual(episodeState.value, {
            downloaded: true,
            filePath: "/library/Naruto/Naruto - 01.mkv",
          });
        }
        assert.deepStrictEqual(yield* mediaRepository.loadCurrentUnitState(20, 2), Option.none());

        const notFoundExit = yield* Effect.exit(mediaRepository.getMediaRow(999));
        assert.deepStrictEqual(notFoundExit._tag, "Failure");
        if (notFoundExit._tag === "Failure") {
          const failure = Cause.failureOption(notFoundExit.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value instanceof MediaNotFoundError, true);
          }
        }
      }),
    schema,
  }),
);

it.effect("operations repository helpers encode and decode download provenance", () =>
  Effect.gen(function* () {
    const encoded = yield* encodeDownloadSourceMetadata({
      chosen_from_seadex: true,
      decision_reason: "Accepted (WEB-DL 1080p, score 12)",
      group: "SubsPlease",
      parsed_title: "[SubsPlease] Naruto - 01 (1080p)",
      previous_quality: "WEB-DL 720p",
      previous_score: 7,
      resolution: "1080p",
      selection_kind: "upgrade",
      selection_score: 12,
      source_identity: {
        unit_numbers: [1],
        label: "01",
        scheme: "absolute",
      },
    });

    assert.deepStrictEqual(yield* decodeDownloadSourceMetadata(encoded), {
      chosen_from_seadex: true,
      decision_reason: "Accepted (WEB-DL 1080p, score 12)",
      group: "SubsPlease",
      parsed_title: "[SubsPlease] Naruto - 01 (1080p)",
      previous_quality: "WEB-DL 720p",
      previous_score: 7,
      resolution: "1080p",
      selection_kind: "upgrade",
      selection_score: 12,
      source_identity: {
        unit_numbers: [1],
        label: "01",
        scheme: "absolute",
      },
    });
  }),
);

it.effect("operations repository metadata decoders fail for corrupt stored JSON", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(decodeDownloadSourceMetadata("not-json"));

    assert.deepStrictEqual(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag === "None", false);
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "StoredDataError");
      }
    }
  }),
);

it.scoped("DownloadRepository claim and release download reconciliation", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile) =>
      Effect.gen(function* () {
        yield* tryDatabasePromise("Failed to seed media for claim test", () =>
          db.insert(media).values(makeClaimMediaRow()),
        );

        const repo = makeDownloadRepository(db);
        const loadRow = (id: number) =>
          tryDatabasePromise("Failed to load download for claim test", () =>
            db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
          );
        const insertDownload = (overrides: Partial<typeof downloads.$inferInsert>) =>
          tryDatabasePromise("Failed to seed download for claim test", () =>
            db
              .insert(downloads)
              .values({
                addedAt: "2024-01-01T00:00:00.000Z",
                mediaId: 1,
                mediaTitle: "Naruto",
                torrentName: "Naruto - 01",
                unitNumber: 1,
                status: "completed",
                ...overrides,
              })
              .returning({ id: downloads.id }),
          ).pipe(Effect.map((rows) => rows[0]!.id));

        const id = yield* insertDownload({ infoHash: "hash-one" });

        // claim acquires an unclaimed download
        assert.deepStrictEqual(yield* repo.claimDownloadReconciliation(id, "token-a"), true);
        assert.deepStrictEqual((yield* loadRow(id))[0]?.reconciledAt, "token-a");

        // a second concurrent claim is refused and keeps the original token
        assert.deepStrictEqual(yield* repo.claimDownloadReconciliation(id, "token-b"), false);
        assert.deepStrictEqual((yield* loadRow(id))[0]?.reconciledAt, "token-a");

        // unknown ids cannot be claimed
        assert.deepStrictEqual(yield* repo.claimDownloadReconciliation(9999, "token-c"), false);

        // release is a no-op for a stale token, resets only the matching token
        yield* repo.releaseDownloadReconciliationClaim({ downloadId: id, claimToken: "token-b" });
        assert.deepStrictEqual((yield* loadRow(id))[0]?.reconciledAt, "token-a");
        yield* repo.releaseDownloadReconciliationClaim({ downloadId: id, claimToken: "token-a" });
        assert.deepStrictEqual((yield* loadRow(id))[0]?.reconciledAt, null);

        // claim -> release -> re-claim works (retry cycle leaves no stale token)
        assert.deepStrictEqual(yield* repo.claimDownloadReconciliation(id, "token-d"), true);
        yield* repo.releaseDownloadReconciliationClaim({ downloadId: id, claimToken: "token-d" });
        assert.deepStrictEqual(yield* repo.claimDownloadReconciliation(id, "token-d"), true);

        // finalize overwrites the token with a timestamp; release is then a no-op
        yield* repo.markDownloadReconciled({ downloadId: id, now: "2024-02-01T00:00:00.000Z" });
        yield* repo.releaseDownloadReconciliationClaim({ downloadId: id, claimToken: "token-d" });
        assert.deepStrictEqual((yield* loadRow(id))[0]?.reconciledAt, "2024-02-01T00:00:00.000Z");

        // a finalized download can no longer be claimed
        assert.deepStrictEqual(yield* repo.claimDownloadReconciliation(id, "token-e"), false);
      }),
    schema,
  }),
);

function makeClaimMediaRow(): typeof media.$inferInsert {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    format: "TV",
    genres: "[]",
    id: 1,
    mediaKind: "anime",
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: "/library/Naruto",
    status: "RELEASING",
    studios: "[]",
    titleRomaji: "Naruto",
  };
}
