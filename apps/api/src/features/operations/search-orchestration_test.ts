import { Cause, Effect, Exit } from "effect";

import * as dbSchema from "@/db/schema.ts";
import { anime } from "@/db/schema.ts";
import { assert, it } from "@effect/vitest";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import { SeaDexClient } from "@/features/operations/seadex-client.ts";
import { makeSearchReleaseSupport } from "@/features/operations/search-orchestration-release-search.ts";

it.scoped(
  "searchEpisodeReleases fails instead of silently degrading when SeaDex enrichment fails",
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

          const config = makeTestConfig("/tmp/test.sqlite", (c) => ({
            ...c,
            downloads: { ...c.downloads, use_seadex: true },
          }));
          const animeRow: typeof anime.$inferSelect = {
            addedAt: "2024-01-01T00:00:00.000Z",
            background: null,
            bannerImage: null,
            coverImage: null,
            description: null,
            duration: null,
            endDate: null,
            endYear: null,
            episodeCount: 12,
            favorites: null,
            format: "TV",
            genres: "[]",
            id: 20,
            malId: null,
            members: null,
            monitored: true,
            nextAiringAt: null,
            nextAiringEpisode: null,
            popularity: null,
            profileName: "Default",
            recommendedAnime: null,
            relatedAnime: null,
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
          };

          const searchReleaseService = makeSearchReleaseSupport({
            db,
            getRuntimeConfig: () => Effect.succeed(config),
            rssClient,
            seadexClient,
          });

          const exit = yield* Effect.exit(
            searchReleaseService.searchEpisodeReleases(animeRow, 1, config),
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

function makeRelease(): ParsedRelease {
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
  };
}
