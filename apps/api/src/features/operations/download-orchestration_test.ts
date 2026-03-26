import { assertEquals, assertExists, it } from "../../test/vitest.ts";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { NotificationEvent } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import * as schema from "../../db/schema.ts";
import { anime, appConfig, downloads, episodes } from "../../db/schema.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { MediaProbeNoMetadata } from "../../lib/media-probe.ts";
import { withSqliteTestDbEffect } from "../../test/database-test.ts";
import {
  readTextFile,
  withFileSystemSandboxEffect,
  writeTextFile,
} from "../../test/filesystem-test.ts";
import {
  encodeConfigCore,
  encodeNumberList,
  type ConfigCoreEncoded,
} from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import { Schema } from "effect";
import { ConfigCoreSchema } from "../system/config-schema.ts";
import { EventBus } from "../events/event-bus.ts";
import { makeOperationsSharedState } from "./runtime-support.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import {
  decodeDownloadEventMetadata,
  decodeDownloadSourceMetadata,
  encodeDownloadSourceMetadata,
  loadDownloadPresentationContexts,
} from "./repository.ts";
import { maybeQBitConfig, tryDatabasePromise, wrapOperationsError } from "./service-support.ts";
import { toDatabaseError } from "../../lib/effect-db.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";

it.scoped("triggerDownload persists merged release provenance on queued downloads", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) =>
      withLibraryDir(({ fs, libraryDir }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          yield* seedConfig(appDb, databaseFile, (config) => ({
            ...config,
            library: { ...config.library, naming_format: "{title} - {source_episode_segment}" },
          }));
          yield* insertTestAnime(appDb, libraryDir);

          const events: NotificationEvent[] = [];
          const orchestration = createDownloadOrchestrationForTest(appDb, events, fs);

          yield* orchestration.triggerDownload({
            anime_id: 1,
            decision_reason: "Manual grab from release search",
            episode_number: 1,
            group: "SubsPlease",
            info_hash: "abcdef1234567890abcdef1234567890abcdef12",
            magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Show",
            release_metadata: {
              resolution: "720p",
              source_url: "https://nyaa.si/view/123",
              trusted: true,
            },
            title: "[SubsPlease] Show - 01 (1080p) [HEVC] [AAC 2.0]",
          });

          const rows = yield* Effect.tryPromise(() => appDb.select().from(downloads).limit(1));
          const [row] = rows;
          assertExists(row);
          const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);

          assertEquals(row.status, "queued");
          assertEquals(row.coveredEpisodes, "[1]");
          assertEquals(sourceMetadata?.group, "SubsPlease");
          assertEquals(sourceMetadata?.parsed_title, "Show");
          assertEquals(sourceMetadata?.resolution, "720p");
          assertEquals(sourceMetadata?.video_codec, "HEVC");
          assertEquals(sourceMetadata?.audio_codec, "AAC");
          assertEquals(sourceMetadata?.audio_channels, "2.0");
          assertEquals(sourceMetadata?.decision_reason, "Manual grab from release search");
          assertEquals(sourceMetadata?.indexer, "Nyaa");
          assertEquals(sourceMetadata?.selection_kind, "manual");
          assertEquals(sourceMetadata?.trusted, true);
          assertEquals(sourceMetadata?.source_url, "https://nyaa.si/view/123");
          assertEquals(sourceMetadata?.source_identity, {
            episode_numbers: [1],
            label: "01",
            scheme: "absolute",
          });
          assertEquals(
            events.map((event) => event.type),
            ["DownloadStarted", "DownloadProgress"],
          );
          assertEquals(events[0]?.type, "DownloadStarted");
          if (events[0]?.type === "DownloadStarted") {
            assertEquals(events[0].payload.source_metadata?.indexer, "Nyaa");
            assertEquals(events[0].payload.source_metadata?.resolution, "720p");
          }
        }),
      ),
    schema,
  }),
);

it.scoped("triggerDownload stores source metadata in queued download event payload", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) =>
      withLibraryDir(({ fs, libraryDir }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          yield* seedConfig(appDb, databaseFile, (config) => config);
          yield* insertTestAnime(appDb, libraryDir);

          const orchestration = createDownloadOrchestrationForTest(appDb, [], fs);

          yield* orchestration.triggerDownload({
            anime_id: 1,
            decision_reason: "Manual grab from release search",
            episode_number: 1,
            group: "SubsPlease",
            info_hash: "abcdef1234567890abcdef1234567890abcdef12",
            magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Show",
            release_metadata: {
              resolution: "720p",
              source_url: "https://nyaa.si/view/123",
              trusted: true,
            },
            title: "[SubsPlease] Show - 01 (1080p) [HEVC] [AAC 2.0]",
          });

          const events = yield* Effect.tryPromise(() =>
            appDb
              .select()
              .from(schema.downloadEvents)
              .where(eq(schema.downloadEvents.eventType, "download.queued"))
              .limit(1),
          );
          const [event] = events;
          assertExists(event);

          const parsed = event.metadata
            ? yield* decodeDownloadEventMetadata(event.metadata)
            : undefined;
          assertExists(parsed);
          assertEquals(Array.isArray(parsed.covered_episodes), true);
          assertEquals(parsed.covered_episodes, [1]);
          assertEquals(parsed.source_metadata?.indexer, "Nyaa");
          assertEquals(parsed.source_metadata?.resolution, "720p");
          assertEquals(parsed.source_metadata?.trusted, true);
          assertEquals(parsed.source_metadata?.decision_reason, "Manual grab from release search");
        }),
      ),
    schema,
  }),
);

it.scoped(
  "triggerDownload prevents overlapping episode queue races across concurrent callers",
  () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        withLibraryDir(({ fs, libraryDir }) =>
          Effect.gen(function* () {
            const appDb = db as AppDatabase;
            yield* seedConfig(appDb, databaseFile, (config) => config);
            yield* insertTestAnime(appDb, libraryDir);
            const coordination = yield* makeOperationsSharedState();

            const orchestrations = Array.from({ length: 8 }, () =>
              createDownloadOrchestrationForTest(appDb, [], fs, coordination),
            );

            yield* Effect.forEach(
              orchestrations,
              (orchestration, index) =>
                Effect.either(
                  orchestration.triggerDownload({
                    anime_id: 1,
                    episode_number: 1,
                    group: "SubsPlease",
                    info_hash: `${(index + 1).toString(16).padStart(40, "0")}`,
                    magnet: `magnet:?xt=urn:btih:${(index + 1)
                      .toString(16)
                      .padStart(40, "0")}&dn=Show`,
                    title: `[SubsPlease] Show - 01 (1080p) [attempt ${index + 1}]`,
                  }),
                ),
              { concurrency: "unbounded", discard: true },
            );

            const rows = yield* Effect.tryPromise(() =>
              appDb.select().from(downloads).where(eq(downloads.animeId, 1)),
            );

            assertEquals(rows.length, 1);
            assertEquals(rows[0]?.episodeNumber, 1);
            assertEquals(rows[0]?.status, "queued");
            assertEquals(rows[0]?.coveredEpisodes, "[1]");
          }),
        ),
      schema,
    }),
);

it.scoped("applyDownloadActionEffect stores structured metadata on pause and resume events", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) =>
      withLibraryDir(({ fs, libraryDir }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          yield* seedConfig(appDb, databaseFile, (config) => config);
          yield* insertTestAnime(appDb, libraryDir);

          const [inserted] = yield* Effect.tryPromise(() =>
            appDb
              .insert(downloads)
              .values({
                addedAt: "2024-01-01T00:00:00.000Z",
                animeId: 1,
                animeTitle: "Show",
                contentPath: null,
                coveredEpisodes: encodeNumberList([1, 2]),
                downloadDate: null,
                downloadedBytes: 10,
                episodeNumber: 1,
                errorMessage: null,
                etaSeconds: 0,
                externalState: "downloading",
                groupName: "SubsPlease",
                infoHash: null,
                isBatch: true,
                lastErrorAt: null,
                lastSyncedAt: "2024-01-01T00:00:00.000Z",
                magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
                progress: 12,
                reconciledAt: null,
                retryCount: 0,
                savePath: null,
                sourceMetadata: encodeDownloadSourceMetadata({
                  indexer: "Nyaa",
                  source_url: "https://nyaa.si/view/123",
                  trusted: true,
                }),
                speedBytes: 0,
                status: "downloading",
                torrentName: "[SubsPlease] Show - 01-02",
                totalBytes: 100,
              })
              .returning({ id: downloads.id }),
          );

          const orchestration = createDownloadOrchestrationForTest(appDb, [], fs);

          yield* orchestration.applyDownloadActionEffect(inserted.id, "pause");
          yield* orchestration.applyDownloadActionEffect(inserted.id, "resume");

          const rows = yield* Effect.tryPromise(() =>
            appDb
              .select()
              .from(schema.downloadEvents)
              .where(eq(schema.downloadEvents.downloadId, inserted.id)),
          );
          const pauseEvent = rows.find((row) => row.eventType === "download.paused");
          const resumeEvent = rows.find((row) => row.eventType === "download.resumed");
          assertExists(pauseEvent);
          assertExists(resumeEvent);

          const pauseMetadata = pauseEvent.metadata
            ? yield* decodeDownloadEventMetadata(pauseEvent.metadata)
            : undefined;
          const resumeMetadata = resumeEvent.metadata
            ? yield* decodeDownloadEventMetadata(resumeEvent.metadata)
            : undefined;
          assertExists(pauseMetadata);
          assertExists(resumeMetadata);
          assertEquals(pauseMetadata.covered_episodes, [1, 2]);
          assertEquals(pauseMetadata.source_metadata?.indexer, "Nyaa");
          assertEquals(pauseMetadata.source_metadata?.source_url, "https://nyaa.si/view/123");
          assertEquals(pauseMetadata.source_metadata?.trusted, true);
          assertEquals(resumeMetadata.covered_episodes, [1, 2]);
          assertEquals(resumeMetadata.source_metadata?.indexer, "Nyaa");
          assertEquals(resumeMetadata.source_metadata?.source_url, "https://nyaa.si/view/123");
          assertEquals(resumeMetadata.source_metadata?.trusted, true);
        }),
      ),
    schema,
  }),
);

it.scoped("retryDownloadById stores structured metadata in retried events", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) =>
      withLibraryDir(({ fs, libraryDir }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          yield* seedConfig(appDb, databaseFile, (config) => config);
          yield* insertTestAnime(appDb, libraryDir);

          const [inserted] = yield* Effect.tryPromise(() =>
            appDb
              .insert(downloads)
              .values({
                addedAt: "2024-01-01T00:00:00.000Z",
                animeId: 1,
                animeTitle: "Show",
                contentPath: null,
                coveredEpisodes: encodeNumberList([3]),
                downloadDate: null,
                downloadedBytes: 0,
                episodeNumber: 3,
                errorMessage: "network error",
                etaSeconds: null,
                externalState: "error",
                groupName: "SubsPlease",
                infoHash: null,
                isBatch: false,
                lastErrorAt: "2024-01-01T00:00:00.000Z",
                lastSyncedAt: "2024-01-01T00:00:00.000Z",
                magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
                progress: 0,
                reconciledAt: null,
                retryCount: 1,
                savePath: null,
                sourceMetadata: encodeDownloadSourceMetadata({
                  decision_reason: "Upgrade from 720p",
                  indexer: "Nyaa",
                  source_url: "https://nyaa.si/view/456",
                }),
                speedBytes: 0,
                status: "error",
                torrentName: "[SubsPlease] Show - 03",
                totalBytes: 100,
              })
              .returning({ id: downloads.id }),
          );

          const orchestration = createDownloadOrchestrationForTest(appDb, [], fs);

          yield* orchestration.retryDownloadById(inserted.id);

          const [updatedRow] = yield* Effect.tryPromise(() =>
            appDb.select().from(downloads).where(eq(downloads.id, inserted.id)),
          );
          assertExists(updatedRow);
          assertEquals(updatedRow.status, "queued");
          assertEquals(updatedRow.retryCount, 2);

          const eventRows = yield* Effect.tryPromise(() =>
            appDb
              .select()
              .from(schema.downloadEvents)
              .where(
                and(
                  eq(schema.downloadEvents.downloadId, inserted.id),
                  eq(schema.downloadEvents.eventType, "download.retried"),
                ),
              )
              .limit(1),
          );
          const [retriedEvent] = eventRows;
          assertExists(retriedEvent);

          const metadata = retriedEvent.metadata
            ? yield* decodeDownloadEventMetadata(retriedEvent.metadata)
            : undefined;
          assertExists(metadata);
          assertEquals(metadata.covered_episodes, [3]);
          assertEquals(metadata.source_metadata?.indexer, "Nyaa");
          assertEquals(metadata.source_metadata?.source_url, "https://nyaa.si/view/456");
          assertEquals(metadata.source_metadata?.decision_reason, "Upgrade from 720p");
        }),
      ),
    schema,
  }),
);

it.scoped("applyDownloadActionEffect stores structured metadata on delete events", () =>
  withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) =>
      withLibraryDir(({ fs, libraryDir }) =>
        Effect.gen(function* () {
          const appDb = db as AppDatabase;
          yield* seedConfig(appDb, databaseFile, (config) => config);
          yield* insertTestAnime(appDb, libraryDir);

          const [inserted] = yield* Effect.tryPromise(() =>
            appDb
              .insert(downloads)
              .values({
                addedAt: "2024-01-01T00:00:00.000Z",
                animeId: 1,
                animeTitle: "Show",
                contentPath: null,
                coveredEpisodes: encodeNumberList([4, 5]),
                downloadDate: null,
                downloadedBytes: 10,
                episodeNumber: 4,
                errorMessage: null,
                etaSeconds: 0,
                externalState: "downloading",
                groupName: "SubsPlease",
                infoHash: null,
                isBatch: true,
                lastErrorAt: null,
                lastSyncedAt: "2024-01-01T00:00:00.000Z",
                magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
                progress: 20,
                reconciledAt: null,
                retryCount: 0,
                savePath: null,
                sourceMetadata: encodeDownloadSourceMetadata({
                  indexer: "Nyaa",
                  source_url: "https://nyaa.si/view/987",
                  trusted: false,
                }),
                speedBytes: 0,
                status: "downloading",
                torrentName: "[SubsPlease] Show - 04-05",
                totalBytes: 100,
              })
              .returning({ id: downloads.id }),
          );

          const orchestration = createDownloadOrchestrationForTest(appDb, [], fs);

          yield* orchestration.applyDownloadActionEffect(inserted.id, "delete", false);

          const remainingRows = yield* Effect.tryPromise(() =>
            appDb.select().from(downloads).where(eq(downloads.id, inserted.id)).limit(1),
          );
          assertEquals(remainingRows.length, 0);

          const deleteEventRows = yield* Effect.tryPromise(() =>
            appDb
              .select()
              .from(schema.downloadEvents)
              .where(
                and(
                  eq(schema.downloadEvents.downloadId, inserted.id),
                  eq(schema.downloadEvents.eventType, "download.deleted"),
                ),
              )
              .limit(1),
          );
          const [deleteEvent] = deleteEventRows;
          assertExists(deleteEvent);
          assertEquals(deleteEvent.toStatus, "deleted");

          const metadata = deleteEvent.metadata
            ? yield* decodeDownloadEventMetadata(deleteEvent.metadata)
            : undefined;
          assertExists(metadata);
          assertEquals(metadata.covered_episodes, [4, 5]);
          assertEquals(metadata.source_metadata?.indexer, "Nyaa");
          assertEquals(metadata.source_metadata?.source_url, "https://nyaa.si/view/987");
          assertEquals(metadata.source_metadata?.trusted, false);
        }),
      ),
    schema,
  }),
);

it.scoped(
  "reconcileDownloadByIdEffect imports lone generic batch files using stored coverage and provenance",
  () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        withLibraryAndDownloadDirs(({ fs, libraryDir, downloadDir }) =>
          Effect.gen(function* () {
            const appDb = db as AppDatabase;
            yield* seedConfig(appDb, databaseFile, (config) => ({
              ...config,
              library: {
                ...config.library,
                import_mode: "copy",
                naming_format: "{title} - {source_episode_segment} [{quality} {resolution}]",
              },
            }));
            yield* insertTestAnime(appDb, libraryDir, {
              titleEnglish: null,
            });
            yield* Effect.tryPromise(() =>
              appDb.insert(episodes).values([
                {
                  aired: "2025-03-14",
                  animeId: 1,
                  downloaded: false,
                  filePath: null,
                  number: 1,
                  title: "Pilot",
                },
                {
                  aired: "2025-03-21",
                  animeId: 1,
                  downloaded: false,
                  filePath: null,
                  number: 2,
                  title: "Second",
                },
              ]),
            );

            const sourcePath = `${downloadDir}/download.mkv`;
            yield* writeTextFile(fs, sourcePath, "video");

            const [inserted] = yield* Effect.tryPromise(() =>
              appDb
                .insert(downloads)
                .values({
                  addedAt: "2024-01-01T00:00:00.000Z",
                  animeId: 1,
                  animeTitle: "Show",
                  contentPath: downloadDir,
                  coveredEpisodes: "[1,2]",
                  downloadDate: "2024-01-01T00:10:00.000Z",
                  downloadedBytes: 100,
                  episodeNumber: 1,
                  errorMessage: null,
                  etaSeconds: 0,
                  externalState: "completed",
                  groupName: "SubsPlease",
                  infoHash: "abcdef1234567890abcdef1234567890abcdef12",
                  isBatch: true,
                  lastErrorAt: null,
                  lastSyncedAt: "2024-01-01T00:10:00.000Z",
                  magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
                  progress: 100,
                  reconciledAt: null,
                  retryCount: 0,
                  savePath: downloadDir,
                  sourceMetadata: encodeDownloadSourceMetadata({
                    quality: "WEB-DL",
                    resolution: "1080p",
                    source_identity: {
                      episode_numbers: [1, 2],
                      label: "01-02",
                      scheme: "absolute",
                    },
                  }),
                  speedBytes: 0,
                  status: "completed",
                  torrentName: "[SubsPlease] Show Season Pack",
                  totalBytes: 100,
                })
                .returning({ id: downloads.id }),
            );

            const events: NotificationEvent[] = [];
            const orchestration = createDownloadOrchestrationForTest(appDb, events, fs);

            yield* orchestration.reconcileDownloadByIdEffect(inserted.id);

            const episodeRows = yield* Effect.tryPromise(() =>
              appDb.select().from(episodes).where(eq(episodes.animeId, 1)).orderBy(episodes.number),
            );
            const updatedDownloadRows = yield* Effect.tryPromise(() =>
              appDb.select().from(downloads).where(eq(downloads.id, inserted.id)).limit(1),
            );
            const expectedPath = `${libraryDir}/Show - 01-02 [WEB-DL 1080p].mkv`;

            assertEquals(
              episodeRows.map((row) => ({
                downloaded: row.downloaded,
                filePath: row.filePath,
                number: row.number,
              })),
              [
                { downloaded: true, filePath: expectedPath, number: 1 },
                { downloaded: true, filePath: expectedPath, number: 2 },
              ],
            );
            assertEquals(updatedDownloadRows[0]?.status, "imported");
            assertExists(updatedDownloadRows[0]?.reconciledAt);
            assertEquals(yield* readTextFile(fs, expectedPath), "video");

            const importedBatchEvents = yield* Effect.tryPromise(() =>
              appDb
                .select()
                .from(schema.downloadEvents)
                .where(
                  and(
                    eq(schema.downloadEvents.downloadId, inserted.id),
                    eq(schema.downloadEvents.eventType, "download.imported.batch"),
                  ),
                )
                .limit(1),
            );
            const [importedBatchEvent] = importedBatchEvents;
            assertExists(importedBatchEvent);
            const importedBatchMetadata = importedBatchEvent.metadata
              ? yield* decodeDownloadEventMetadata(importedBatchEvent.metadata)
              : undefined;
            assertExists(importedBatchMetadata);
            assertEquals(importedBatchMetadata.covered_episodes, [1, 2]);
            assertEquals(importedBatchMetadata.imported_path, libraryDir);
            assertEquals(importedBatchMetadata.source_metadata?.resolution, "1080p");
            assertEquals(importedBatchMetadata.source_metadata?.quality, "WEB-DL");
          }),
        ),
      schema,
    }),
);

it.scoped(
  "syncDownloadsWithQBitEffect stores structured metadata for status and coverage events",
  () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        withLibraryDir(({ fs, libraryDir }) =>
          Effect.gen(function* () {
            const appDb = db as AppDatabase;
            yield* seedConfig(appDb, databaseFile, (config) => ({
              ...config,
              qbittorrent: { ...config.qbittorrent, enabled: true, password: "secret" },
            }));
            yield* insertTestAnime(appDb, libraryDir);

            const infoHash = "abcdef1234567890abcdef1234567890abcdef12";
            const [inserted] = yield* Effect.tryPromise(() =>
              appDb
                .insert(downloads)
                .values({
                  addedAt: "2024-01-01T00:00:00.000Z",
                  animeId: 1,
                  animeTitle: "Show",
                  contentPath: null,
                  coveredEpisodes: encodeNumberList([1]),
                  downloadDate: null,
                  downloadedBytes: 10,
                  episodeNumber: 1,
                  errorMessage: null,
                  etaSeconds: 0,
                  externalState: "queued",
                  groupName: "SubsPlease",
                  infoHash,
                  isBatch: true,
                  lastErrorAt: null,
                  lastSyncedAt: "2024-01-01T00:00:00.000Z",
                  magnet: `magnet:?xt=urn:btih:${infoHash}`,
                  progress: 5,
                  reconciledAt: null,
                  retryCount: 0,
                  savePath: null,
                  sourceMetadata: encodeDownloadSourceMetadata({
                    indexer: "Nyaa",
                    source_url: "https://nyaa.si/view/789",
                    trusted: true,
                  }),
                  speedBytes: 0,
                  status: "queued",
                  torrentName: "[SubsPlease] Show Batch",
                  totalBytes: 100,
                })
                .returning({ id: downloads.id }),
            );

            const orchestration = makeDownloadOrchestration({
              db: appDb,
              dbError: toDatabaseError,
              eventBus: {
                publish: () => Effect.void,
              } as unknown as typeof EventBus.Service,
              fs,
              mediaProbe: {
                probeVideoFile: () => Effect.succeed(new MediaProbeNoMetadata({})),
              },
              maybeQBitConfig,
              qbitClient: {
                addTorrentUrl: () => Effect.void,
                deleteTorrent: () => Effect.void,
                listTorrentContents: () =>
                  Effect.succeed([
                    {
                      is_seed: false,
                      name: "Show - 01-02.mkv",
                      priority: 1,
                      progress: 1,
                      size: 100,
                    },
                  ]),
                listTorrents: () =>
                  Effect.succeed([
                    {
                      content_path: "/downloads/Show - 01-02.mkv",
                      downloaded: 100,
                      dlspeed: 0,
                      eta: 0,
                      hash: infoHash,
                      name: "[SubsPlease] Show Batch",
                      progress: 1,
                      save_path: "/downloads",
                      size: 100,
                      state: "pausedDL",
                    },
                  ]),
                pauseTorrent: () => Effect.void,
                resumeTorrent: () => Effect.void,
              } as unknown as typeof QBitTorrentClient.Service,
              coordination: makeTestOperationsCoordination(),
              tryDatabasePromise,
              wrapOperationsError,
              currentMonotonicMillis: () => Effect.succeed(0),
              currentTimeMillis: () => Effect.succeed(1704067200000),
              nowIso: () => Effect.succeed("2024-01-01T00:00:00.000Z"),
              randomUuid: () => Effect.succeed("test-uuid-0000"),
            });

            yield* orchestration.syncDownloadsWithQBitEffect();

            const updated = yield* Effect.tryPromise(() =>
              appDb.select().from(downloads).where(eq(downloads.id, inserted.id)).limit(1),
            );
            assertEquals(updated[0]?.status, "paused");
            assertEquals(updated[0]?.coveredEpisodes, "[1,2]");

            const statusEvents = yield* Effect.tryPromise(() =>
              appDb
                .select()
                .from(schema.downloadEvents)
                .where(
                  and(
                    eq(schema.downloadEvents.downloadId, inserted.id),
                    eq(schema.downloadEvents.eventType, "download.status_changed"),
                  ),
                )
                .limit(1),
            );
            const coverageEvents = yield* Effect.tryPromise(() =>
              appDb
                .select()
                .from(schema.downloadEvents)
                .where(
                  and(
                    eq(schema.downloadEvents.downloadId, inserted.id),
                    eq(schema.downloadEvents.eventType, "download.coverage_refined"),
                  ),
                )
                .limit(1),
            );

            const [statusEvent] = statusEvents;
            const [coverageEvent] = coverageEvents;
            assertExists(statusEvent);
            assertExists(coverageEvent);

            const statusMetadata = statusEvent.metadata
              ? yield* decodeDownloadEventMetadata(statusEvent.metadata)
              : undefined;
            const coverageMetadata = coverageEvent.metadata
              ? yield* decodeDownloadEventMetadata(coverageEvent.metadata)
              : undefined;
            assertExists(statusMetadata);
            assertExists(coverageMetadata);

            assertEquals(statusMetadata.covered_episodes, [1]);
            assertEquals(statusMetadata.source_metadata?.indexer, "Nyaa");
            assertEquals(statusMetadata.source_metadata?.source_url, "https://nyaa.si/view/789");
            assertEquals(statusMetadata.source_metadata?.trusted, true);
            assertEquals(coverageMetadata.covered_episodes, [1, 2]);
            assertEquals(coverageMetadata.source_metadata?.indexer, "Nyaa");
            assertEquals(coverageMetadata.source_metadata?.source_url, "https://nyaa.si/view/789");
            assertEquals(coverageMetadata.source_metadata?.trusted, true);
          }),
        ),
      schema,
    }),
);

it.scoped(
  "loadDownloadPresentationContexts falls back to reconciled download path when no episode row is mapped",
  () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        withLibraryDir(({ libraryDir }) =>
          Effect.gen(function* () {
            const appDb = db as AppDatabase;
            yield* seedConfig(appDb, databaseFile, (config) => config);
            yield* insertTestAnime(appDb, libraryDir, {
              coverImage: "https://example.com/show.jpg",
              titleEnglish: null,
            });

            const [row] = yield* Effect.tryPromise(() =>
              appDb
                .insert(downloads)
                .values({
                  addedAt: "2024-01-01T00:00:00.000Z",
                  animeId: 1,
                  animeTitle: "Show",
                  contentPath: `${libraryDir}/Show - 01.mkv`,
                  coveredEpisodes: "[1]",
                  downloadDate: null,
                  downloadedBytes: 100,
                  episodeNumber: 1,
                  errorMessage: null,
                  etaSeconds: 0,
                  externalState: "imported",
                  groupName: null,
                  infoHash: null,
                  isBatch: false,
                  lastErrorAt: null,
                  lastSyncedAt: null,
                  magnet: null,
                  progress: 100,
                  reconciledAt: "2024-01-01T00:10:00.000Z",
                  retryCount: 0,
                  savePath: libraryDir,
                  sourceMetadata: null,
                  speedBytes: 0,
                  status: "imported",
                  torrentName: "Show - 01",
                  totalBytes: 100,
                })
                .returning(),
            );

            const contexts = yield* loadDownloadPresentationContexts(appDb, [row]);

            assertEquals(contexts.get(row.id), {
              animeImage: "https://example.com/show.jpg",
              importedPath: `${libraryDir}/Show - 01.mkv`,
            });
          }),
        ),
      schema,
    }),
);

it.scoped(
  "reconcileDownloadByIdEffect imports generic completed files using stored provenance",
  () =>
    withSqliteTestDbEffect({
      migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
      run: (db, databaseFile) =>
        withLibraryAndDownloadDirs(({ fs, libraryDir, downloadDir }) =>
          Effect.gen(function* () {
            const appDb = db as AppDatabase;
            yield* seedConfig(appDb, databaseFile, (config) => ({
              ...config,
              library: {
                ...config.library,
                import_mode: "copy",
                naming_format: "{title} - {source_episode_segment} [{quality} {resolution}]",
              },
            }));
            yield* insertTestAnime(appDb, libraryDir, {
              titleEnglish: null,
            });
            yield* Effect.tryPromise(() =>
              appDb.insert(episodes).values({
                aired: "2025-03-14",
                animeId: 1,
                downloaded: false,
                filePath: null,
                number: 1,
                title: "Pilot",
              }),
            );

            const sourcePath = `${downloadDir}/download.mkv`;
            yield* writeTextFile(fs, sourcePath, "video");

            const [inserted] = yield* Effect.tryPromise(() =>
              appDb
                .insert(downloads)
                .values({
                  addedAt: "2024-01-01T00:00:00.000Z",
                  animeId: 1,
                  animeTitle: "Show",
                  contentPath: downloadDir,
                  coveredEpisodes: "[1]",
                  downloadDate: "2024-01-01T00:10:00.000Z",
                  downloadedBytes: 100,
                  episodeNumber: 1,
                  errorMessage: null,
                  etaSeconds: 0,
                  externalState: "completed",
                  groupName: "SubsPlease",
                  infoHash: "abcdef1234567890abcdef1234567890abcdef12",
                  isBatch: false,
                  lastErrorAt: null,
                  lastSyncedAt: "2024-01-01T00:10:00.000Z",
                  magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
                  progress: 100,
                  reconciledAt: null,
                  retryCount: 0,
                  savePath: downloadDir,
                  sourceMetadata: encodeDownloadSourceMetadata({
                    quality: "WEB-DL",
                    resolution: "1080p",
                    source_identity: {
                      episode_numbers: [1],
                      label: "01",
                      scheme: "absolute",
                    },
                  }),
                  speedBytes: 0,
                  status: "completed",
                  torrentName: "[SubsPlease] Show - 01 (1080p)",
                  totalBytes: 100,
                })
                .returning({ id: downloads.id }),
            );

            const events: NotificationEvent[] = [];
            const orchestration = createDownloadOrchestrationForTest(appDb, events, fs);

            yield* orchestration.reconcileDownloadByIdEffect(inserted.id);

            const episodeRows = yield* Effect.tryPromise(() =>
              appDb
                .select()
                .from(episodes)
                .where(and(eq(episodes.animeId, 1), eq(episodes.number, 1)))
                .limit(1),
            );
            const updatedDownloadRows = yield* Effect.tryPromise(() =>
              appDb.select().from(downloads).where(eq(downloads.id, inserted.id)).limit(1),
            );
            const expectedPath = `${libraryDir}/Show - 01 [WEB-DL 1080p].mkv`;

            assertEquals(episodeRows[0]?.downloaded, true);
            assertEquals(episodeRows[0]?.filePath, expectedPath);
            assertEquals(updatedDownloadRows[0]?.status, "imported");
            assertExists(updatedDownloadRows[0]?.reconciledAt);
            assertEquals(yield* readTextFile(fs, expectedPath), "video");
            assertEquals(yield* readTextFile(fs, sourcePath), "video");

            const importedEvents = yield* Effect.tryPromise(() =>
              appDb
                .select()
                .from(schema.downloadEvents)
                .where(
                  and(
                    eq(schema.downloadEvents.downloadId, inserted.id),
                    eq(schema.downloadEvents.eventType, "download.imported"),
                  ),
                )
                .limit(1),
            );
            const [importedEvent] = importedEvents;
            assertExists(importedEvent);
            const importedMetadata = importedEvent.metadata
              ? yield* decodeDownloadEventMetadata(importedEvent.metadata)
              : undefined;
            assertExists(importedMetadata);
            assertEquals(importedMetadata.covered_episodes, [1]);
            assertEquals(importedMetadata.imported_path, expectedPath);
            assertEquals(importedMetadata.source_metadata?.resolution, "1080p");
            assertEquals(importedMetadata.source_metadata?.quality, "WEB-DL");

            const finishedEvent = events.at(-1);
            assertEquals(finishedEvent?.type, "DownloadFinished");
            if (finishedEvent?.type === "DownloadFinished") {
              assertEquals(finishedEvent.payload.imported_path, expectedPath);
              assertEquals(finishedEvent.payload.source_metadata?.quality, "WEB-DL");
            }
          }),
        ),
      schema,
    }),
);

function createDownloadOrchestrationForTest(
  db: AppDatabase,
  events: NotificationEvent[],
  fs: FileSystemShape,
  coordination = makeTestOperationsCoordination(),
) {
  return makeDownloadOrchestration({
    db,
    dbError: toDatabaseError,
    eventBus: {
      publish: (event: NotificationEvent) =>
        Effect.sync(() => {
          events.push(event);
        }),
    } as unknown as typeof EventBus.Service,
    fs,
    mediaProbe: {
      probeVideoFile: () => Effect.succeed(new MediaProbeNoMetadata({})),
    },
    maybeQBitConfig,
    qbitClient: {
      addTorrentUrl: () => Effect.void,
      deleteTorrent: () => Effect.void,
      listTorrentContents: () => Effect.succeed([]),
      listTorrents: () => Effect.succeed([]),
      pauseTorrent: () => Effect.void,
      resumeTorrent: () => Effect.void,
    } as unknown as typeof QBitTorrentClient.Service,
    coordination,
    tryDatabasePromise,
    wrapOperationsError,
    currentMonotonicMillis: () => Effect.succeed(0),
    currentTimeMillis: () => Effect.succeed(1704067200000),
    nowIso: () => Effect.succeed("2024-01-01T00:00:00.000Z"),
    randomUuid: () => Effect.succeed("test-uuid-0000"),
  });
}

function makeTestOperationsCoordination(): import("./runtime-support.ts").OperationsCoordinationShape {
  return {
    completeUnmappedScan: () => Effect.void,
    forkUnmappedScanLoop: (_loop: Effect.Effect<void>) => Effect.void,
    runExclusiveDownloadTrigger: <A, E>(operation: Effect.Effect<A, E>) => operation,
    tryBeginUnmappedScan: () => Effect.succeed(false),
  };
}

const insertTestAnime = Effect.fn("Test.insertDownloadAnime")(function* (
  db: AppDatabase,
  rootFolder: string,
  overrides: Partial<typeof anime.$inferInsert> = {},
) {
  yield* Effect.tryPromise(() =>
    db.insert(anime).values({
      addedAt: "2024-01-01T00:00:00.000Z",
      bannerImage: null,
      coverImage: null,
      description: null,
      endDate: null,
      endYear: null,
      episodeCount: 12,
      format: "TV",
      genres: "[]",
      id: 1,
      malId: null,
      monitored: true,
      nextAiringAt: null,
      nextAiringEpisode: null,
      profileName: "Default",
      releaseProfileIds: encodeNumberList([]),
      rootFolder,
      score: null,
      startDate: "2025-01-01",
      startYear: 2025,
      status: "RELEASING",
      studios: "[]",
      titleEnglish: "Show",
      titleNative: null,
      titleRomaji: "Show",
      ...overrides,
    }),
  );
});

function buildSeedConfigData(
  databaseFile: string,
  mutate: (encoded: ConfigCoreEncoded) => ConfigCoreEncoded,
): string {
  const encoded = mutate(Schema.encodeSync(ConfigCoreSchema)(makeDefaultConfig(databaseFile)));
  return encodeConfigCore(encoded);
}

const seedConfig = Effect.fn("Test.seedConfig")(function* (
  db: AppDatabase,
  databaseFile: string,
  mutate: (encoded: ConfigCoreEncoded) => ConfigCoreEncoded,
) {
  const data = buildSeedConfigData(databaseFile, mutate);
  yield* Effect.tryPromise(() =>
    db.insert(appConfig).values({
      data,
      id: 1,
      updatedAt: "2024-01-01T00:00:00.000Z",
    }),
  );
});

const withLibraryDir = Effect.fn("Test.withLibraryDir")(function* <A, E, R>(
  run: (input: { fs: FileSystemShape; libraryDir: string }) => Effect.Effect<A, E, R>,
) {
  return yield* withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const libraryDir = `${root}/library`;
      yield* fs.mkdir(libraryDir, { recursive: true });
      return yield* run({ fs, libraryDir });
    }),
  );
});

const withLibraryAndDownloadDirs = Effect.fn("Test.withLibraryAndDownloadDirs")(function* <A, E, R>(
  run: (input: {
    fs: FileSystemShape;
    libraryDir: string;
    downloadDir: string;
  }) => Effect.Effect<A, E, R>,
) {
  return yield* withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const libraryDir = `${root}/library`;
      const downloadDir = `${root}/downloads`;
      yield* fs.mkdir(libraryDir, { recursive: true });
      yield* fs.mkdir(downloadDir, { recursive: true });
      return yield* run({ fs, libraryDir, downloadDir });
    }),
  );
});
