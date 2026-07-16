import { Effect, Layer, Option } from "effect";

import * as dbSchema from "@/db/schema.ts";
import { media } from "@/db/schema.ts";
import { assert, it } from "@effect/vitest";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { RssClient } from "@/features/operations/rss/rss-client.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { SeaDexClient } from "@/features/operations/search/seadex-client.ts";
import { SearchReleaseService } from "@/features/operations/search/search-orchestration-release-search.ts";
import { makeMediaRepository, MediaRepository } from "@/features/media/shared/media-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { Config } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";

function withSearchReleaseService(input: {
  readonly db: AppDatabase;
  readonly config: Config;
  readonly rssClient: typeof RssClient.Service;
  readonly seadexClient: typeof SeaDexClient.Service;
}) {
  const layer = SearchReleaseService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(RssClient, input.rssClient),
        Layer.succeed(SeaDexClient, input.seadexClient),
        Layer.succeed(MediaRepository, makeMediaRepository(input.db)),
        Layer.succeed(
          RuntimeConfigSnapshotService,
          RuntimeConfigSnapshotService.make({
            getRuntimeConfig: () => Effect.succeed(input.config),
            replaceRuntimeConfig: () => Effect.void,
          }),
        ),
      ),
    ),
  );

  return Effect.gen(function* () {
    return yield* SearchReleaseService;
  }).pipe(Effect.provide(layer));
}

it.scoped("searchUnitReleases returns unenriched releases when SeaDex enrichment fails", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const config = makeTestConfig("/tmp/test.sqlite");
        const release = makeRelease();
        const searchReleaseService = yield* withSearchReleaseService({
          config,
          db,
          rssClient: RssClient.make({
            fetchItems: () => Effect.succeed([release]),
          }),
          seadexClient: SeaDexClient.make({
            getEntryByAniListId: () =>
              Effect.fail(
                new ExternalCallError({
                  cause: new Error("SeaDex unavailable"),
                  message: "SeaDex lookup failed",
                  operation: "seadex.getEntryByAniListId",
                }),
              ),
          }),
        });

        const releases = yield* searchReleaseService.searchUnitReleases(makeMediaRow(), 1, config);

        assert.deepStrictEqual(releases, [release]);
        assert.deepStrictEqual(releases[0]?.isSeaDex, false);
      }),
    schema: dbSchema,
  }),
);

it.scoped("searchUnitReleases tries season episode query variants", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          config,
          db,
          rssClient: RssClient.make({
            fetchItems: (url: string) => {
              const query = new URL(url).searchParams.get("q") ?? "";
              requestedQueries.push(query);

              return Effect.succeed(
                query === "Release that Witch S01E08"
                  ? [
                      makeRelease({
                        title:
                          "[ToonsHub] Release that Witch S01E08 1080p CR WEB-DL AAC2.0 H.264 (Fangkai Nage Nüwu, Multi-Subs)",
                      }),
                    ]
                  : [],
              );
            },
          }),
          seadexClient: makeSeaDexNoneClient(),
        });

        const releases = yield* searchReleaseService.searchUnitReleases(
          makeMediaRow({ titleEnglish: "Release that Witch", titleRomaji: "Fangkai Nage Nüwu" }),
          8,
          config,
        );

        assert.deepStrictEqual(requestedQueries.includes("Release that Witch S01E08"), true);
        assert.deepStrictEqual(
          releases.map((release) => release.title),
          [
            "[ToonsHub] Release that Witch S01E08 1080p CR WEB-DL AAC2.0 H.264 (Fangkai Nage Nüwu, Multi-Subs)",
          ],
        );
      }),
    schema: dbSchema,
  }),
);

it.scoped("searchUnitReleases searches stored synonyms and normalized aliases", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          config,
          db,
          rssClient: RssClient.make({
            fetchItems: (url: string) => {
              const query = new URL(url).searchParams.get("q") ?? "";
              requestedQueries.push(query);

              return Effect.succeed(
                query === "Fangkai Nage Nuwu S01E08"
                  ? [
                      makeRelease({
                        title: "[ToonsHub] Fangkai Nage Nuwu S01E08 1080p CR WEB-DL AAC2.0 H.264",
                      }),
                    ]
                  : [],
              );
            },
          }),
          seadexClient: makeSeaDexNoneClient(),
        });

        const releases = yield* searchReleaseService.searchUnitReleases(
          makeMediaRow({
            synonyms: '["Fangkai Nage Nuwu"]',
            titleRomaji: "Fangkai Nage Nüwu",
          }),
          8,
          config,
        );

        assert.deepStrictEqual(requestedQueries.includes("Fangkai Nage Nuwu S01E08"), true);
        assert.deepStrictEqual(
          releases.map((release) => release.title),
          ["[ToonsHub] Fangkai Nage Nuwu S01E08 1080p CR WEB-DL AAC2.0 H.264"],
        );
      }),
    schema: dbSchema,
  }),
);

it.scoped("searchUnitReleases falls back to broad title search and keeps requested episode", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          config,
          db,
          rssClient: RssClient.make({
            fetchItems: (url: string) => {
              const query = new URL(url).searchParams.get("q") ?? "";
              requestedQueries.push(query);

              return Effect.succeed(
                query === "Release that Witch"
                  ? [
                      makeRelease({
                        infoHash: "1000000000000000000000000000000000000000",
                        title: "[SubsPlease] Release that Witch - 07 (1080p)",
                      }),
                      makeRelease({
                        infoHash: "2000000000000000000000000000000000000000",
                        title: "[SubsPlease] Release that Witch - 08 (1080p)",
                      }),
                    ]
                  : [],
              );
            },
          }),
          seadexClient: makeSeaDexNoneClient(),
        });

        const releases = yield* searchReleaseService.searchUnitReleases(
          makeMediaRow({ titleEnglish: "Release that Witch", titleRomaji: "Fangkai Nage Nüwu" }),
          8,
          config,
        );

        assert.deepStrictEqual(requestedQueries.includes("Release that Witch"), true);
        assert.deepStrictEqual(
          releases.map((release) => release.title),
          ["[SubsPlease] Release that Witch - 08 (1080p)"],
        );
      }),
    schema: dbSchema,
  }),
);

it.scoped("searchUnitReleases uses Nyaa literature category for manga", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const requestedCategories: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          config,
          db,
          rssClient: RssClient.make({
            fetchItems: (url: string) => {
              const parsedUrl = new URL(url);
              requestedCategories.push(parsedUrl.searchParams.get("c") ?? "");

              return Effect.succeed(
                parsedUrl.searchParams.get("q") === "Witch Hat Atelier Vol 02"
                  ? [
                      makeRelease({
                        title: "[Group] Witch Hat Atelier Vol 02 [English]",
                      }),
                    ]
                  : [],
              );
            },
          }),
          seadexClient: makeSeaDexNoneClient(),
        });

        const releases = yield* searchReleaseService.searchUnitReleases(
          makeMediaRow({
            mediaKind: "manga",
            titleRomaji: "Witch Hat Atelier",
          }),
          2,
          config,
        );

        assert.deepStrictEqual(
          requestedCategories.every((category) => category === "3_1"),
          true,
        );
        assert.deepStrictEqual(
          releases.map((release) => release.title),
          ["[Group] Witch Hat Atelier Vol 02 [English]"],
        );
      }),
    schema: dbSchema,
  }),
);

function makeMediaRow(input: Partial<typeof media.$inferSelect> = {}): typeof media.$inferSelect {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    background: null,
    bannerImage: null,
    coverImage: null,
    description: null,
    duration: null,
    endDate: null,
    endYear: null,
    unitCount: 12,
    favorites: null,
    format: "TV",
    genres: "[]",
    id: 20,
    mediaKind: "anime",
    malId: null,
    members: null,
    monitored: true,
    nextAiringAt: null,
    nextAiringUnit: null,
    popularity: null,
    profileName: "Default",
    recommendedMedia: null,
    relatedMedia: null,
    releaseProfileIds: "[]",
    rootFolder: "/library/Show",
    rank: null,
    rating: null,
    score: null,
    source: null,
    startDate: null,
    startYear: null,
    status: "RELEASING",
    studios: "[]",
    synonyms: null,
    titleEnglish: null,
    titleNative: null,
    titleRomaji: "Show",
    ...input,
  };
}

function makeRelease(input: Partial<ParsedRelease> = {}): ParsedRelease {
  return {
    group: "SubsPlease",
    infoHash: "abcdef1234567890abcdef1234567890abcdef12",
    isSeaDex: false,
    isSeaDexBest: false,
    leechers: 0,
    magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
    pubDate: "2024-01-01T00:00:00.000Z",
    remake: false,
    resolution: "1080p",
    seeders: 5,
    size: "1000 B",
    sizeBytes: 1000,
    title: "[SubsPlease] Show - 01 (1080p)",
    trusted: true,
    viewUrl: "https://nyaa.si/view/1",
    ...input,
  };
}

function makeSeaDexNoneClient() {
  return SeaDexClient.make({
    getEntryByAniListId: () => Effect.succeed(Option.none()),
  });
}
