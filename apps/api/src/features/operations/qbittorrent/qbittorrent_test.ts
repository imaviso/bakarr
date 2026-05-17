import { assert, it } from "@effect/vitest";
import { HttpClient, HttpClientError, HttpClientResponse } from "@effect/platform";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, TestClock } from "effect";

import { ClockService, ClockServiceLive } from "@/infra/clock.ts";
import { ExternalCallLive } from "@/infra/effect/retry.ts";
import {
  QBitTorrentClient,
  QBitTorrentClientLive,
} from "@/features/operations/qbittorrent/qbittorrent.ts";

const ExternalCallWithLiveClock = ExternalCallLive.pipe(Layer.provide(ClockServiceLive));

it.scoped("QBitTorrentClient uses provided HttpClient", () =>
  Effect.gen(function* () {
    let requestCount = 0;

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
              ExternalCallWithLiveClock,
              Layer.succeed(
                HttpClient.HttpClient,
                makeQBitClient(() => {
                  requestCount += 1;
                }),
              ),
            ),
          ),
        ),
      ),
    );

    assert.deepStrictEqual(
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
    assert.deepStrictEqual(requestCount, 2);
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
              ExternalCallWithLiveClock,
              Layer.succeed(HttpClient.HttpClient, makeQBitClient()),
            ),
          ),
        ),
      ),
    );

    assert.deepStrictEqual(
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

it.effect("QBitTorrentClient falls back to no-auth request when login fails", () =>
  Effect.gen(function* () {
    const requestPaths: string[] = [];
    const torrents = yield* Effect.flatMap(QBitTorrentClient, (client) =>
      client.listTorrents({
        baseUrl: "http://localhost:8080",
        password: "secret",
        username: "admin",
      }),
    ).pipe(
      Effect.provide(
        QBitTorrentClientLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              ClockServiceLive,
              ExternalCallWithLiveClock,
              Layer.succeed(
                HttpClient.HttpClient,
                HttpClient.make((request, url) => {
                  requestPaths.push(url.pathname);

                  if (url.pathname === "/api/v2/auth/login") {
                    return Effect.succeed(
                      HttpClientResponse.fromWeb(request, new Response("Fails.", { status: 403 })),
                    );
                  }

                  if (url.pathname === "/api/v2/torrents/info") {
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
        ),
      ),
    );

    assert.deepStrictEqual(torrents, []);
    assert.deepStrictEqual(requestPaths, ["/api/v2/auth/login", "/api/v2/torrents/info"]);
  }),
);

it.effect("QBitTorrentClient sends qBittorrent add options", () =>
  Effect.gen(function* () {
    let addBody = "";

    yield* Effect.flatMap(QBitTorrentClient, (client) =>
      client.addTorrentUrl(
        {
          baseUrl: "https://qbit.example",
          category: "media",
          password: "secret",
          ratioLimit: 1.5,
          savePath: "/downloads/media",
          username: "demo",
        },
        "magnet:?xt=urn:btih:abc123",
      ),
    ).pipe(
      Effect.provide(
        QBitTorrentClientLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              ClockServiceLive,
              ExternalCallWithLiveClock,
              Layer.succeed(
                HttpClient.HttpClient,
                HttpClient.make((request, url) => {
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

                  if (url.pathname === "/api/v2/torrents/add") {
                    if (request.body._tag === "Uint8Array") {
                      addBody = new TextDecoder().decode(request.body.body);
                    }

                    return Effect.succeed(
                      HttpClientResponse.fromWeb(request, new Response("Ok.", { status: 200 })),
                    );
                  }

                  return Effect.succeed(
                    HttpClientResponse.fromWeb(request, new Response("not found", { status: 404 })),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );

    const params = new URLSearchParams(addBody);
    assert.deepStrictEqual(params.get("category"), "media");
    assert.deepStrictEqual(params.get("ratioLimit"), "1.5");
    assert.deepStrictEqual(params.get("savepath"), "/downloads/media");
    assert.deepStrictEqual(params.get("urls"), "magnet:?xt=urn:btih:abc123");
  }),
);

it.effect(
  "QBitTorrentClient does not re-authenticate cached sessions for unrelated transport failures",
  () =>
    Effect.gen(function* () {
      const loginCalls: string[] = [];
      const infoCookies: string[] = [];
      const testClockLayer = Layer.succeed(ClockService, {
        currentMonotonicMillis: TestClock.currentTimeMillis,
        currentTimeMillis: TestClock.currentTimeMillis,
      });
      const externalCallLayer = ExternalCallLive.pipe(Layer.provide(testClockLayer));
      const clientLayer = QBitTorrentClientLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            testClockLayer,
            externalCallLayer,
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

      yield* Effect.flatMap(QBitTorrentClient, (client) =>
        Effect.gen(function* () {
          yield* client.listTorrents(config);
          const secondCall = yield* client.listTorrents(config).pipe(Effect.exit, Effect.fork);

          yield* TestClock.adjust("31 seconds");

          const secondExit = yield* Fiber.join(secondCall);

          assert.deepStrictEqual(loginCalls, ["abc123"]);
          assert.deepStrictEqual(Exit.isFailure(secondExit), true);
          if (Exit.isFailure(secondExit)) {
            const failure = Cause.failureOption(secondExit.cause);
            assert.deepStrictEqual(failure._tag, "Some");
            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "ExternalCallError");
            }
          }
        }),
      ).pipe(Effect.provide(clientLayer));
    }),
);

it.effect("QBitTorrentClient shares in-flight login across concurrent requests", () =>
  Effect.gen(function* () {
    const releaseLogin = yield* Deferred.make<void>();
    let loginCount = 0;

    const clientLayer = QBitTorrentClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallWithLiveClock,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request, url) => {
              if (url.pathname === "/api/v2/auth/login") {
                loginCount += 1;

                return Deferred.await(releaseLogin).pipe(
                  Effect.as(
                    HttpClientResponse.fromWeb(
                      request,
                      new Response("Ok.", {
                        headers: { "set-cookie": "SID=singleflight; HttpOnly" },
                        status: 200,
                      }),
                    ),
                  ),
                );
              }

              if (url.pathname === "/api/v2/torrents/info") {
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

    const effect = Effect.flatMap(QBitTorrentClient, (client) =>
      Effect.gen(function* () {
        const first = yield* Effect.fork(client.listTorrents(config));
        const second = yield* Effect.fork(client.listTorrents(config));

        yield* Deferred.succeed(releaseLogin, void 0);

        yield* Fiber.join(first);
        yield* Fiber.join(second);
      }),
    ).pipe(Effect.provide(clientLayer));

    yield* effect;

    assert.deepStrictEqual(loginCount, 1);
  }),
);

function makeQBitClient(onRequest?: () => void | undefined) {
  return HttpClient.make((request, url) => {
    onRequest?.();

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
