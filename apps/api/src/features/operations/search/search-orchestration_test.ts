import { Cause, Effect, Exit, Option } from "effect";

import * as dbSchema from "@/db/schema.ts";
import { media } from "@/db/schema.ts";
import { assert, it } from "@effect/vitest";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { RssClient } from "@/features/operations/rss/rss-client.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { SeaDexClient } from "@/features/operations/search/seadex-client.ts";
import { makeSearchReleaseSupport } from "@/features/operations/search/search-orchestration-release-search.ts";

it.scoped(
  "searchUnitReleases fails instead of silently degrading when SeaDex enrichment fails",
  () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const rssClient = {
            fetchItems: () => Effect.succeed([makeRelease()]),
          } satisfies typeof RssClient.Service;

          const seadexClient = {
            getEntryByAniListId: () =>
              Effect.fail(
                new ExternalCallError({
                  cause: new Error("SeaDex unavailable"),
                  message: "SeaDex lookup failed",
                  operation: "seadex.getEntryByAniListId",
                }),
              ),
          } satisfies typeof SeaDexClient.Service;

          const config = makeTestConfig("/tmp/test.sqlite");
          const searchReleaseService = makeSearchReleaseSupport({
            db,
            getRuntimeConfig: () => Effect.succeed(config),
            rssClient,
            seadexClient,
          });

          const exit = yield* Effect.exit(
            searchReleaseService.searchUnitReleases(makeAnimeRow(), 1, config),
          );

          assert.deepStrictEqual(Exit.isFailure(exit), true);
          if (Exit.isFailure(exit)) {
            const failure = Cause.failureOption(exit.cause);
            assert.deepStrictEqual(failure._tag, "Some");
            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "ExternalCallError");
            }
          }
        }),
      schema: dbSchema,
    }),
);

it.scoped("searchUnitReleases tries season episode query variants", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const requestedQueries: string[] = [];
        const rssClient = {
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
        } satisfies typeof RssClient.Service;

        const seadexClient = {
          getEntryByAniListId: () => Effect.succeed(Option.none()),
        } satisfies typeof SeaDexClient.Service;

        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = makeSearchReleaseSupport({
          db,
          getRuntimeConfig: () => Effect.succeed(config),
          rssClient,
          seadexClient,
        });

        const releases = yield* searchReleaseService.searchUnitReleases(
          makeAnimeRow({ titleEnglish: "Release that Witch", titleRomaji: "Fangkai Nage Nüwu" }),
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
        const rssClient = {
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
        } satisfies typeof RssClient.Service;

        const searchReleaseService = makeSearchReleaseSupport({
          db,
          getRuntimeConfig: () => Effect.succeed(makeTestConfig("/tmp/test.sqlite")),
          rssClient,
          seadexClient: makeSeaDexNoneClient(),
        });

        const releases = yield* searchReleaseService.searchUnitReleases(
          makeAnimeRow({
            synonyms: '["Fangkai Nage Nuwu"]',
            titleRomaji: "Fangkai Nage Nüwu",
          }),
          8,
          makeTestConfig("/tmp/test.sqlite"),
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
        const rssClient = {
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
        } satisfies typeof RssClient.Service;

        const config = makeTestConfig("/tmp/test.sqlite");
        const searchReleaseService = makeSearchReleaseSupport({
          db,
          getRuntimeConfig: () => Effect.succeed(config),
          rssClient,
          seadexClient: makeSeaDexNoneClient(),
        });

        const releases = yield* searchReleaseService.searchUnitReleases(
          makeAnimeRow({ titleEnglish: "Release that Witch", titleRomaji: "Fangkai Nage Nüwu" }),
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

function makeAnimeRow(input: Partial<typeof media.$inferSelect> = {}): typeof media.$inferSelect {
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

function makeSeaDexNoneClient(): typeof SeaDexClient.Service {
  return {
    getEntryByAniListId: () => Effect.succeed(Option.none()),
  } satisfies typeof SeaDexClient.Service;
}
