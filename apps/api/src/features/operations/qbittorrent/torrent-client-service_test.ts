import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { QBitTorrentClient } from "@/features/operations/qbittorrent/qbittorrent.ts";
import {
  TorrentClientService,
  TorrentClientServiceLive,
} from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { makeRuntimeConfigSnapshotStub } from "@/test/stubs.ts";

it.effect("TorrentClientService allows trusted-local qBittorrent without password", () =>
  Effect.gen(function* () {
    let capturedPassword: string | undefined;
    const config = makeTestConfig("/tmp/test.sqlite");
    const testConfig = {
      ...config,
      qbittorrent: {
        ...config.qbittorrent,
        enabled: true,
        password: null,
        trusted_local: true,
      },
    };
    const serviceLayer = TorrentClientServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(RuntimeConfigSnapshotService, makeRuntimeConfigSnapshotStub(testConfig)),
          Layer.succeed(QBitTorrentClient, {
            addTorrentUrl: () => Effect.void,
            deleteTorrent: () => Effect.void,
            listTorrentContents: () => Effect.succeed([]),
            listTorrents: (qbitConfig) => {
              capturedPassword = qbitConfig.password;
              return Effect.succeed([]);
            },
            pauseTorrent: () => Effect.void,
            resumeTorrent: () => Effect.void,
          }),
        ),
      ),
    );

    const result = yield* Effect.flatMap(TorrentClientService, (service) =>
      service.listTorrentsIfEnabled(),
    ).pipe(Effect.provide(serviceLayer));

    assert.deepStrictEqual(result, { _tag: "Found", torrents: [] });
    assert.deepStrictEqual(capturedPassword, "");
  }),
);
