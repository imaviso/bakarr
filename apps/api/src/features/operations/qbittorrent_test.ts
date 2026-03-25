import { assertEquals, it } from "../../test/vitest.ts";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Layer } from "effect";

import { QBitTorrentClient, QBitTorrentClientLive } from "./qbittorrent.ts";

it.scoped("QBitTorrentClient uses provided HttpClient", () =>
  Effect.gen(function* () {
    const originalFetch = globalThis.fetch;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      })
    );
    yield* Effect.sync(() => {
      globalThis.fetch = ((() =>
        Promise.reject(new Error("unexpected global fetch"))) as unknown) as typeof fetch;
    });

    const torrents = yield* Effect.flatMap(QBitTorrentClient, (client) =>
      client.listTorrents({
        baseUrl: "https://qbit.example",
        password: "secret",
        username: "demo",
      })).pipe(
        Effect.provide(
          QBitTorrentClientLive.pipe(
            Layer.provide(
              Layer.succeed(HttpClient.HttpClient, makeQBitClient()),
            ),
          ),
        ),
      );

    assertEquals(torrents.map((t) => ({ ...t })), [
      {
        added_on: 123,
        downloaded: 512,
        dlspeed: 42,
        eta: 10,
        hash: "abc123",
        name: "Remote Torrent",
        progress: 0.5,
        save_path: "/downloads",
        size: 1024,
        state: "downloading",
      },
    ]);
  })
);

it.effect("QBitTorrentClient can load torrent contents", () =>
  Effect.gen(function* () {
    const files = yield* Effect.flatMap(QBitTorrentClient, (client) =>
      client.listTorrentContents(
        {
          baseUrl: "https://qbit.example",
          password: "secret",
          username: "demo",
        },
        "abc123",
      )).pipe(
        Effect.provide(
          QBitTorrentClientLive.pipe(
            Layer.provide(
              Layer.succeed(HttpClient.HttpClient, makeQBitClient()),
            ),
          ),
        ),
      );

    assertEquals(files.map((f) => ({ ...f })), [{
      index: 0,
      is_seed: false,
      name: "Chainsaw Man/Chainsaw Man - 01.mkv",
      priority: 1,
      progress: 0.25,
      size: 1024,
    }]);
  })
);

function makeQBitClient() {
  return HttpClient.make((request, url) => {
    if (url.pathname === "/api/v2/auth/login") {
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("Ok.", {
            headers: { "set-cookie": "SID=abc123; HttpOnly" },
            status: 200,
          }),
        ),
      );
    }

    if (url.pathname === "/api/v2/torrents/info") {
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify([
              {
                added_on: 123,
                downloaded: 512,
                dlspeed: 42,
                eta: 10,
                hash: "abc123",
                name: "Remote Torrent",
                progress: 0.5,
                save_path: "/downloads",
                size: 1024,
                state: "downloading",
              },
            ]),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          ),
        ),
      );
    }

    if (url.pathname === "/api/v2/torrents/files") {
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify([{
              index: 0,
              is_seed: false,
              name: "Chainsaw Man/Chainsaw Man - 01.mkv",
              priority: 1,
              progress: 0.25,
              size: 1024,
            }]),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          ),
        ),
      );
    }

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("not found", { status: 404 }),
      ),
    );
  });
}
