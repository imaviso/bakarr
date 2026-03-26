import { assertEquals, it } from "../../test/vitest.ts";
import { HttpClient, HttpClientError, HttpClientResponse } from "@effect/platform";
import { Cause, Effect, Exit, Layer } from "effect";

import { ClockServiceLive } from "../../lib/clock.ts";
import { QBitTorrentClient, QBitTorrentClientLive } from "./qbittorrent.ts";

it.scoped("QBitTorrentClient uses provided HttpClient", () =>
  Effect.gen(function* () {
    const originalFetch = globalThis.fetch;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      }),
    );
    yield* Effect.sync(() => {
      globalThis.fetch = (() =>
        Promise.reject(new Error("unexpected global fetch"))) as unknown as typeof fetch;
    });

    const torrents = yield* Effect.flatMap(QBitTorrentClient, (client) =>
      client.listTorrents({
        baseUrl: "https://qbit.example",
        password: "secret",
        username: "demo",
      }),
    ).pipe(
      Effect.provide(
        QBitTorrentClientLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              ClockServiceLive,
              Layer.succeed(HttpClient.HttpClient, makeQBitClient()),
            ),
          ),
        ),
      ),
    );

    assertEquals(
      torrents.map((torrent) => structuredClone(torrent)),
      [
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
      ],
    );
  }),
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
      ),
    ).pipe(
      Effect.provide(
        QBitTorrentClientLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              ClockServiceLive,
              Layer.succeed(HttpClient.HttpClient, makeQBitClient()),
            ),
          ),
        ),
      ),
    );

    assertEquals(
      files.map((file) => structuredClone(file)),
      [
        {
          index: 0,
          is_seed: false,
          name: "Chainsaw Man/Chainsaw Man - 01.mkv",
          priority: 1,
          progress: 0.25,
          size: 1024,
        },
      ],
    );
  }),
);

it("QBitTorrentClient does not re-authenticate cached sessions for unrelated transport failures", async () => {
  const loginCalls: string[] = [];
  const infoCookies: string[] = [];
  const clientLayer = QBitTorrentClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        ClockServiceLive,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request, url) => {
            if (url.pathname === "/api/v2/auth/login") {
              const sessionId = loginCalls.length === 0 ? "abc123" : "def456";
              loginCalls.push(sessionId);
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response("Ok.", {
                    headers: { "set-cookie": `SID=${sessionId}; HttpOnly` },
                    status: 200,
                  }),
                ),
              );
            }

            if (url.pathname === "/api/v2/torrents/info") {
              const cookie = request.headers["cookie"] ?? "";
              infoCookies.push(cookie);

              if (cookie.includes("SID=abc123") && infoCookies.length === 1) {
                return Effect.succeed(
                  HttpClientResponse.fromWeb(
                    request,
                    new Response("[]", {
                      headers: { "content-type": "application/json" },
                      status: 200,
                    }),
                  ),
                );
              }

              if (cookie.includes("SID=abc123")) {
                return Effect.fail(
                  new HttpClientError.RequestError({
                    request,
                    reason: "Transport",
                    cause: new Error("network failed after 403 retries"),
                    description: "network failed after 403 retries",
                  }),
                );
              }

              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response("[]", {
                    headers: { "content-type": "application/json" },
                    status: 200,
                  }),
                ),
              );
            }

            return Effect.succeed(
              HttpClientResponse.fromWeb(request, new Response("not found", { status: 404 })),
            );
          }),
        ),
      ),
    ),
  );

  const config = {
    baseUrl: "https://qbit.example",
    password: "secret",
    username: "demo",
  };

  const program = Effect.flatMap(QBitTorrentClient, (client) =>
    Effect.gen(function* () {
      yield* client.listTorrents(config);
      const secondExit = yield* Effect.exit(client.listTorrents(config));

      assertEquals(loginCalls, ["abc123"]);
      assertEquals(Exit.isFailure(secondExit), true);
      if (Exit.isFailure(secondExit)) {
        const failure = Cause.failureOption(secondExit.cause);
        assertEquals(failure._tag, "Some");
        if (failure._tag === "Some") {
          assertEquals(failure.value._tag, "ExternalCallError");
        }
      }
    }),
  ).pipe(Effect.provide(clientLayer));

  await Effect.runPromise(program);
}, 10000);

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
            JSON.stringify([
              {
                index: 0,
                is_seed: false,
                name: "Chainsaw Man/Chainsaw Man - 01.mkv",
                priority: 1,
                progress: 0.25,
                size: 1024,
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
      HttpClientResponse.fromWeb(request, new Response("not found", { status: 404 })),
    );
  });
}
