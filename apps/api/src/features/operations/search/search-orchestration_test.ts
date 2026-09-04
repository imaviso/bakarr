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
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { makeMediaRepository } from "@/test/repository-factories.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { Config } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Effect, Layer, Option } from "effect";

function withSearchReleaseService(input: {
  readonly client: NodeSqliteClient.SqliteClient;
  readonly db: AppDatabase;
  readonly config: Config;
  readonly rssClient: typeof RssClient.Service;
  readonly seadexClient: typeof SeaDexClient.Service;
}) {
  const layer = SearchReleaseService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(RssClient, input.rssClient),
        Layer.succeed(SeaDexClient, input.seadexClient),
        Layer.succeed(MediaRepository, makeMediaRepository(input.db, input.client)),
        Layer.succeed(
          RuntimeConfigSnapshotService,
          RuntimeConfigSnapshotService.of({
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

it.effect("searchUnitReleases returns unenriched releases when SeaDex enrichment fails", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const config = makeTestConfig("/tmp/test.sqlite");
        const release = makeRelease();
        const searchReleaseService = yield* withSearchReleaseService({
          client,
          config,
          db,
          rssClient: RssClient.of({
            fetchItems: () => Effect.succeed([release]),
          }),
          seadexClient: SeaDexClient.of({
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

it.effect("searchUnitReleases tries season episode query variants", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          client,
          config,
          db,
          rssClient: RssClient.of({
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

it.effect("searchUnitReleases searches stored synonyms and normalized aliases", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          client,
          config,
          db,
          rssClient: RssClient.of({
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

it.effect("searchUnitReleases falls back to broad title search and keeps requested episode", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          client,
          config,
          db,
          rssClient: RssClient.of({
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

it.effect("searchUnitReleases uses Nyaa literature category for manga", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const requestedCategories: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          client,
          config,
          db,
          rssClient: RssClient.of({
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

it.effect("searchUnitReleases finds hyphenated titles via sanitized alias", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          client,
          config,
          db,
          rssClient: RssClient.of({
            fetchItems: (url: string) => {
              const query = new URL(url).searchParams.get("q") ?? "";
              requestedQueries.push(query);

              // Only sanitized query without hyphens/colons matches the Erai release
              return Effect.succeed(
                query === "BLEACH Sennen Kessen hen Kashin tan 01"
                  ? [
                      makeRelease({
                        title:
                          "[Erai-raws] Bleach: Sennen Kessen Hen - Kashin Tan - 01 [1080p DSNP WEB-DL AVC AAC][MultiSub][AE2878AA]",
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
            titleRomaji: "BLEACH: Sennen Kessen-hen - Kashin-tan",
            titleEnglish: "BLEACH: Thousand-Year Blood War - The Calamity",
          }),
          1,
          config,
        );

        assert.deepStrictEqual(
          requestedQueries.includes("BLEACH Sennen Kessen hen Kashin tan 01"),
          true,
        );
        assert.deepStrictEqual(
          releases.map((release) => release.title),
          [
            "[Erai-raws] Bleach: Sennen Kessen Hen - Kashin Tan - 01 [1080p DSNP WEB-DL AVC AAC][MultiSub][AE2878AA]",
          ],
        );
      }),
    schema: dbSchema,
  }),
);

it.effect("searchUnitReleases finds long titles via truncated alias", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = yield* withSearchReleaseService({
          client,
          config,
          db,
          rssClient: RssClient.of({
            fetchItems: (url: string) => {
              const query = new URL(url).searchParams.get("q") ?? "";
              requestedQueries.push(query);

              return Effect.succeed(
                query === "Saijo no Osewa 05"
                  ? [
                      makeRelease({
                        title:
                          "[Erai-raws] Saijo no Osewa - 05 [1080p CR WEBRip HEVC AAC][MultiSub][992EAFA0]",
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
            titleRomaji:
              "Saijo no Osewa: Takane no Hanadarake na Meimonkou de, Gakuin Ichi no Ojou-sama (Seikatsu Nouryoku Kaimu) wo Kagenagara Osewa suru Koto ni Narimashita",
          }),
          5,
          config,
        );

        assert.deepStrictEqual(requestedQueries.includes("Saijo no Osewa 05"), true);
        assert.deepStrictEqual(
          releases.map((release) => release.title),
          ["[Erai-raws] Saijo no Osewa - 05 [1080p CR WEBRip HEVC AAC][MultiSub][992EAFA0]"],
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
  return SeaDexClient.of({
    getEntryByAniListId: () => Effect.succeed(Option.none()),
  });
}
