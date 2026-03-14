import { assertEquals } from "@std/assert";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Layer } from "effect";

import { QBitTorrentClient, QBitTorrentClientLive } from "./qbittorrent.ts";

Deno.test("QBitTorrentClient uses provided HttpClient", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const torrents = await Effect.runPromise(
      Effect.flatMap(QBitTorrentClient, (client) =>
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
        ),
    );

    assertEquals(torrents, [
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("not found", { status: 404 }),
      ),
    );
  });
}
