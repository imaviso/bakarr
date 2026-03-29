import { Cause, Effect, Exit } from "effect";

import { anime } from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { assertEquals, it } from "../../test/vitest.ts";
import { makeTestConfig } from "../../test/config-fixture.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { RssClient, type ParsedRelease } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";
import { makeSearchReleaseSupport } from "./search-orchestration-release-search.ts";

it.effect(
  "searchEpisodeReleases fails instead of silently degrading when SeaDex enrichment fails",
  () =>
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

      const searchReleaseService = makeSearchReleaseSupport({
        db: {} as AppDatabase,
        rssClient,
        seadexClient,
      });

      const config = makeTestConfig("/tmp/test.sqlite", (c) => ({
        ...c,
        downloads: { ...c.downloads, use_seadex: true },
      }));

      const exit = yield* Effect.exit(
        searchReleaseService.searchEpisodeReleases(
          {
            addedAt: "2024-01-01T00:00:00.000Z",
            bannerImage: null,
            coverImage: null,
            description: null,
            endDate: null,
            endYear: null,
            episodeCount: 12,
            format: "TV",
            genres: "[]",
            id: 20,
            malId: null,
            monitored: true,
            nextAiringAt: null,
            nextAiringEpisode: null,
            profileName: "Default",
            recommendedAnime: null,
            relatedAnime: null,
            releaseProfileIds: "[]",
            rootFolder: "/library/Show",
            score: null,
            startDate: null,
            startYear: null,
            status: "RELEASING",
            studios: "[]",
            synonyms: null,
            titleEnglish: null,
            titleNative: null,
            titleRomaji: "Show",
          } as typeof anime.$inferSelect,
          1,
          config,
        ),
      );

      assertEquals(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assertEquals(failure._tag, "Some");
        if (failure._tag === "Some") {
          assertEquals(failure.value._tag, "ExternalCallError");
        }
      }
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
