import { CommandExecutor } from "@effect/platform";
import { ConfigProvider, Effect, Layer, Option } from "effect";
import { Redacted } from "effect";

import { makeApiLifecycleLayers } from "@/api-lifecycle-layers.ts";
import { AppConfig } from "@/config.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { BackgroundWorkerController } from "@/background-controller-core.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { RssClient } from "@/features/operations/rss-client.ts";
import { SeaDexClient } from "@/features/operations/seadex-client.ts";
import { makeCommandExecutorStub } from "@/test/stubs.ts";
import { assert, it } from "@effect/vitest";

it.effect("api lifecycle app layer resolves background controller and anilist overrides", () =>
  Effect.gen(function* () {
    const aniListLayer = Layer.succeed(AniListClient, {
      getAnimeMetadataById: (_id: number) => Effect.succeed(Option.none()),
      searchAnimeMetadata: (_query: string) => Effect.succeed([]),
    });

    const { appLayer } = makeApiLifecycleLayers(
      {
        bootstrapPassword: Redacted.make("admin"),
        bootstrapUsername: "admin",
        databaseFile: `/tmp/bakarr-lifecycle-test-${crypto.randomUUID()}.sqlite`,
        port: 9999,
      },
      { aniListLayer },
    );

    const controller = yield* BackgroundWorkerController.pipe(Effect.provide(appLayer));
    const aniListClient = yield* AniListClient.pipe(Effect.provide(appLayer));
    const started = yield* controller.isStarted();
    const metadata = yield* aniListClient.getAnimeMetadataById(123);

    assert.ok(controller);
    assert.ok(started === false);
    assert.deepStrictEqual(metadata, Option.none());
  }),
);

it.effect("api lifecycle app layer wires qBittorrent, RSS, and SeaDex overrides", () =>
  Effect.gen(function* () {
    const rssStub = {
      fetchItems: (_url: string) => Effect.succeed([]),
    } satisfies typeof RssClient.Service;
    const seadexStub = {
      getEntryByAniListId: (_aniListId: number) => Effect.succeed(Option.none()),
    } satisfies typeof SeaDexClient.Service;
    const qbitStub = {
      addTorrentUrl: (_config, _url) => Effect.void,
      deleteTorrent: (_config, _hash, _deleteFiles) => Effect.void,
      listTorrentContents: (_config, _hash) => Effect.succeed([]),
      listTorrents: (_config) => Effect.succeed([]),
      pauseTorrent: (_config, _hash) => Effect.void,
      resumeTorrent: (_config, _hash) => Effect.void,
    } satisfies typeof QBitTorrentClient.Service;

    const { appLayer } = makeApiLifecycleLayers(
      {
        bootstrapPassword: Redacted.make("admin"),
        bootstrapUsername: "admin",
        databaseFile: `/tmp/bakarr-lifecycle-test-${crypto.randomUUID()}.sqlite`,
        port: 9999,
      },
      {
        qbitLayer: Layer.succeed(QBitTorrentClient, qbitStub),
        rssLayer: Layer.succeed(RssClient, rssStub),
        seadexLayer: Layer.succeed(SeaDexClient, seadexStub),
      },
    );

    const rssClient = yield* RssClient.pipe(Effect.provide(appLayer));
    const seadexClient = yield* SeaDexClient.pipe(Effect.provide(appLayer));
    const qbitClient = yield* QBitTorrentClient.pipe(Effect.provide(appLayer));

    assert.deepStrictEqual(yield* rssClient.fetchItems("https://example.com/feed.xml"), []);
    assert.deepStrictEqual(yield* seadexClient.getEntryByAniListId(123), Option.none());
    assert.deepStrictEqual(
      yield* qbitClient.listTorrents({
        baseUrl: "https://qbit.example",
        password: "secret",
        username: "demo",
      }),
      [],
    );
  }),
);

it.effect("api lifecycle platform layer wires configProvider and commandExecutor overrides", () =>
  Effect.gen(function* () {
    const commandExecutor = makeCommandExecutorStub((command) =>
      Effect.succeed(
        `stub:${typeof command === "object" && command !== null && "command" in command ? String(command.command) : "unknown"}`,
      ),
    );
    const { platformLayer } = makeApiLifecycleLayers(
      {
        bootstrapPassword: Redacted.make("admin"),
        bootstrapUsername: "admin",
        databaseFile: `/tmp/bakarr-lifecycle-test-${crypto.randomUUID()}.sqlite`,
      },
      {
        commandExecutorLayer: Layer.succeed(CommandExecutor.CommandExecutor, commandExecutor),
        configProvider: ConfigProvider.fromMap(
          new Map([
            ["PORT", "9123"],
            ["SESSION_DURATION_DAYS", "30"],
            ["SESSION_COOKIE_SECURE", "false"],
          ]),
        ),
      },
    );

    const config = yield* AppConfig.pipe(Effect.provide(platformLayer));
    const resolvedExecutor = yield* CommandExecutor.CommandExecutor.pipe(
      Effect.provide(platformLayer),
    );

    assert.deepStrictEqual(config.port, 9123);
    assert.ok(CommandExecutor.TypeId in resolvedExecutor);
  }),
);
