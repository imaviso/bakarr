import { assertEquals, it } from "../../test/vitest.ts";
import { Cause, Effect, Exit } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { AniListClient } from "../anime/anilist.ts";
import { AnimeImportService } from "../anime/import-service.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { EventBus } from "../events/event-bus.ts";
import { makeTestConfig } from "../../test/config-fixture.ts";
import { makeSearchOrchestration } from "./search-orchestration.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { toDatabaseError } from "../../lib/effect-db.ts";
import type { ParsedRelease } from "./rss-client.ts";
import type { QBitTorrentClient } from "./qbittorrent.ts";
import { RssClient } from "./rss-client.ts";
import { SeaDexClient } from "./seadex-client.ts";

it.effect(
  "searchEpisodeReleases fails instead of silently degrading when SeaDex enrichment fails",
  () =>
    Effect.gen(function* () {
      const aniList = {
        getAnimeMetadataById: (_id: number) => Effect.succeed(null),
        searchAnimeMetadata: (_query: string) => Effect.succeed([]),
      } satisfies typeof AniListClient.Service;

      const animeImportService = {
        upsertEpisode: () => Effect.succeed(undefined),
      } satisfies typeof AnimeImportService.Service;

      const eventBus = {
        publish: () => Effect.void,
        subscribe: () => Effect.die("unused"),
      } satisfies typeof EventBus.Service;

      const qbitClient = {
        addTorrentUrl: () => Effect.die("unused"),
        deleteTorrent: () => Effect.die("unused"),
        listTorrentContents: () => Effect.die("unused"),
        listTorrents: () => Effect.die("unused"),
        pauseTorrent: () => Effect.die("unused"),
        resumeTorrent: () => Effect.die("unused"),
      } satisfies typeof QBitTorrentClient.Service;

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

      const orchestration = makeSearchOrchestration({
        aniList,
        animeImportService,
        coordination: {
          completeUnmappedScan: () => Effect.void,
          forkUnmappedScanLoop: (_loop: Effect.Effect<void>) => Effect.void,
          runExclusiveDownloadTrigger: <A, E, R>(operation: Effect.Effect<A, E, R>) => operation,
          tryBeginUnmappedScan: () => Effect.succeed(false),
        },
        db: {} as AppDatabase,
        dbError: toDatabaseError,
        eventBus,
        fs: {} as FileSystemShape,
        maybeQBitConfig: () => null,
        mediaProbe: {} as MediaProbeShape,
        nowIso: () => Effect.succeed("2024-01-01T00:00:00.000Z"),
        publishDownloadProgress: () => Effect.void,
        publishRssCheckProgress: () => Effect.void,
        qbitClient,
        rssClient,
        seadexClient,
        tryDatabasePromise: () => Effect.die("unused"),
        wrapOperationsError: toDatabaseError,
      });

      const config = makeTestConfig("/tmp/test.sqlite", (c) => ({
        ...c,
        downloads: { ...c.downloads, use_seadex: true },
      }));

      const exit = yield* Effect.exit(
        orchestration.searchEpisodeReleases(
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
          },
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
