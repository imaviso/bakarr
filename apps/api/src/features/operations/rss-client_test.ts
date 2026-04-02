import { assert, it } from "@effect/vitest";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Cause, Effect, Exit, Layer } from "effect";

import { ClockServiceLive } from "@/lib/clock.ts";
import { DnsLookupError, DnsResolver } from "@/lib/dns-resolver.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { RssClient, RssClientLive } from "@/features/operations/rss-client.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";

function makeDnsLayer(mock: (name: string, type: "A" | "AAAA") => Promise<string[]>) {
  return Layer.succeed(DnsResolver, {
    resolve: (hostname, recordType) =>
      Effect.tryPromise({
        try: () => mock(hostname, recordType),
        catch: (cause) => new DnsLookupError({ cause, hostname, recordType }),
      }),
  });
}

function makeNotFoundError() {
  return Object.assign(new Error("Not found"), {
    code: "NotFound",
    name: "NotFound",
  });
}

function rssLayer(
  httpClient: HttpClient.HttpClient,
  dnsMock: (name: string, type: "A" | "AAAA") => Promise<string[]>,
) {
  return RssClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        ClockServiceLive,
        Layer.succeed(HttpClient.HttpClient, httpClient),
        makeDnsLayer(dnsMock),
      ),
    ),
  );
}

it.effect("RssClient uses provided HttpClient for feed fetches", () =>
  Effect.gen(function* () {
    const items = yield* fetchFeedItemsEffect(makeRssHttpClient(), (_name, type) =>
      type === "A" ? Promise.resolve(["93.184.216.34"]) : Promise.reject(makeNotFoundError()),
    );

    assert.deepStrictEqual(items, [
      {
        group: "SubsPlease",
        infoHash: "abcdef0123456789abcdef0123456789abcdef01",
        isSeaDex: false,
        isSeaDexBest: false,
        leechers: 12,
        magnet:
          "magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=%5BSubsPlease%5D%20Example%20Show%20-%2001%20(1080p)%20%5BSeaDex%5D",
        pubDate: "Mon, 01 Jan 2024 12:00:00 GMT",
        remake: false,
        resolution: "1080p",
        seeders: 34,
        size: "1.2 GiB",
        sizeBytes: 1288490189,
        title: "[SubsPlease] Example Show - 01 (1080p) [SeaDex]",
        trusted: true,
        viewUrl: "https://nyaa.si/view/123456",
      },
    ]);
  }),
);

it.effect("RssClient rejects data URLs before network access", () =>
  Effect.gen(function* () {
    let httpCalled = false;
    const dataUrl = "data:text/xml,%3Crss%3E%3C/rss%3E";

    const exit = yield* Effect.exit(
      Effect.flatMap(RssClient, (client) => client.fetchItems(dataUrl)).pipe(
        Effect.provide(
          rssLayer(
            makeTrackingHttpClient(() => {
              httpCalled = true;
            }),
            (_name, type) =>
              type === "A"
                ? Promise.resolve(["93.184.216.34"])
                : Promise.reject(makeNotFoundError()),
          ),
        ),
      ),
    );

    assertRssFailure(exit, RssFeedRejectedError, /disallowed protocol/i);
    assert.deepStrictEqual(httpCalled, false);
  }),
);

it.effect(
  "RssClient fails with a typed rejection when a feed resolves to a private IPv6 address",
  () =>
    Effect.gen(function* () {
      let httpCalled = false;

      const exit = yield* Effect.exit(
        fetchFeedItemsEffect(
          makeTrackingHttpClient(() => {
            httpCalled = true;
          }),
          (_name, type) =>
            type === "AAAA" ? Promise.resolve(["fd00::1"]) : Promise.reject(makeNotFoundError()),
        ),
      );

      assertRssFailure(exit, RssFeedRejectedError, /private ip/i);
      assert.deepStrictEqual(httpCalled, false);
    }),
);

it.effect("RssClient fails with a typed rejection when DNS resolution fails", () =>
  Effect.gen(function* () {
    let httpCalled = false;

    const exit = yield* Effect.exit(
      fetchFeedItemsEffect(
        makeTrackingHttpClient(() => {
          httpCalled = true;
        }),
        () => Promise.reject(new Error("SERVFAIL")),
      ),
    );

    assertRssFailure(exit, RssFeedRejectedError, /dns resolution failed/i);
    assert.deepStrictEqual(httpCalled, false);
  }),
);

it.effect("RssClient fails with a typed rejection when a redirect targets a private address", () =>
  Effect.gen(function* () {
    let requestCount = 0;

    const exit = yield* Effect.exit(
      fetchFeedItemsEffect(
        makeRedirectHttpClient(() => requestCount++, "http://192.168.1.1/private.xml"),
        (_name, type) =>
          type === "A" ? Promise.resolve(["93.184.216.34"]) : Promise.reject(makeNotFoundError()),
      ),
    );

    assertRssFailure(exit, RssFeedRejectedError, /private|loopback|link-local|ssrf/i);
    assert.deepStrictEqual(
      requestCount,
      1,
      "Should only make initial request, not follow redirect",
    );
  }),
);

it.effect("RssClient fails with a typed rejection when a chained redirect becomes private", () =>
  Effect.gen(function* () {
    let requestCount = 0;
    const redirectChain: string[] = [];

    const exit = yield* Effect.exit(
      fetchFeedItemsEffect(
        makeChainedRedirectHttpClient(
          () => {
            requestCount++;
          },
          (url) => redirectChain.push(url),
        ),
        (name, type) => {
          if (name === "private.example") {
            return type === "A"
              ? Promise.resolve(["10.0.0.1"])
              : Promise.reject(makeNotFoundError());
          }
          return type === "A"
            ? Promise.resolve(["93.184.216.34"])
            : Promise.reject(makeNotFoundError());
        },
      ),
    );

    assertRssFailure(exit, RssFeedRejectedError, /private|loopback|link-local|ssrf/i);
    assert.deepStrictEqual(
      redirectChain.length,
      1,
      "Should reach redirect but block on private IP",
    );
    assert.deepStrictEqual(requestCount, 1);
  }),
);

it.effect("RssClient aborts redirect loops with a typed rejection", () =>
  Effect.gen(function* () {
    let requestCount = 0;
    const visitedUrls: string[] = [];

    const exit = yield* Effect.exit(
      fetchFeedItemsEffect(
        makeLoopingRedirectHttpClient(
          () => {
            requestCount++;
          },
          (url) => visitedUrls.push(url),
        ),
        () => Promise.resolve(["93.184.216.34"]),
      ),
    );

    assertRssFailure(exit, RssFeedRejectedError, /redirect loop/i);
    assert.deepStrictEqual(
      requestCount <= 6,
      true,
      "Should stop at max redirect hops (5 + initial)",
    );
  }),
);

it.effect("RssClient handles non-redirect valid feed", () =>
  Effect.gen(function* () {
    const items = yield* fetchFeedItemsEffect(makeRssHttpClient(), () =>
      Promise.resolve(["93.184.216.34"]),
    );

    assert.deepStrictEqual(items.length, 1);
    assert.deepStrictEqual(items[0].title, "[SubsPlease] Example Show - 01 (1080p) [SeaDex]");
  }),
);

function makeRssHttpClient() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel>
    <item>
      <title>[SubsPlease] Example Show - 01 (1080p) [SeaDex]</title>
      <link>https://nyaa.si/download/123456.torrent</link>
      <nyaa:infoHash>abcdef0123456789abcdef0123456789abcdef01</nyaa:infoHash>
      <nyaa:size>1.2 GiB</nyaa:size>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <nyaa:seeders>34</nyaa:seeders>
      <nyaa:leechers>12</nyaa:leechers>
      <nyaa:trusted>Yes</nyaa:trusted>
      <nyaa:remake>No</nyaa:remake>
    </item>
  </channel>
</rss>`;

  return HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(xml, {
          headers: { "content-type": "application/rss+xml" },
          status: 200,
        }),
      ),
    ),
  );
}

function makeTrackingHttpClient(onRequest: () => void) {
  return HttpClient.make((request) => {
    onRequest();

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("", {
          headers: { "content-type": "application/rss+xml" },
          status: 200,
        }),
      ),
    );
  });
}

function makeRedirectHttpClient(onRequest: () => void, redirectLocation: string) {
  return HttpClient.make((request) => {
    onRequest();

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("", {
          headers: {
            "content-type": "application/rss+xml",
            location: redirectLocation,
          },
          status: 302,
        }),
      ),
    );
  });
}

function makeChainedRedirectHttpClient(onRequest: () => void, onRedirect: (url: string) => void) {
  return HttpClient.make((request) => {
    onRequest();
    onRedirect(request.url);

    if (request.url.includes("feeds.example")) {
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("", {
            headers: {
              "content-type": "application/rss+xml",
              location: "https://private.example/redirect.xml",
            },
            status: 302,
          }),
        ),
      );
    }

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("", {
          headers: { "content-type": "application/rss+xml" },
          status: 200,
        }),
      ),
    );
  });
}

function makeLoopingRedirectHttpClient(onRequest: () => void, onVisit: (url: string) => void) {
  return HttpClient.make((request) => {
    onRequest();
    onVisit(request.url);

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("", {
          headers: {
            "content-type": "application/rss+xml",
            location: "https://feeds.example/loop1.xml",
          },
          status: 302,
        }),
      ),
    );
  });
}

it.effect("RssClient accepts feeds under byte cap", () =>
  Effect.gen(function* () {
    const smallFeed = `<?xml version="1.0"?><rss><channel><item><title>[SubsPlease] Test - 01 (1080p)</title><link>https://nyaa.si/download/123456.torrent</link><nyaa:infoHash>abcdef0123456789abcdef0123456789abcdef01</nyaa:infoHash><nyaa:size>1.2 GiB</nyaa:size><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate><nyaa:seeders>34</nyaa:seeders><nyaa:leechers>12</nyaa:leechers><nyaa:trusted>Yes</nyaa:trusted><nyaa:remake>No</nyaa:remake></item></channel></rss>`;

    const items = yield* fetchFeedItemsEffect(
      HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(smallFeed, {
              headers: { "content-type": "application/xml" },
              status: 200,
            }),
          ),
        ),
      ),
      () => Promise.resolve(["93.184.216.34"]),
    );

    assert.deepStrictEqual(items.length, 1);
  }),
);

it.effect("RssClient fails with a typed error when feed payload exceeds the byte cap", () =>
  Effect.gen(function* () {
    const largeFeed = "x".repeat(11 * 1024 * 1024);

    const exit = yield* Effect.exit(
      fetchFeedItemsEffect(
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(largeFeed, {
                headers: { "content-type": "application/xml" },
                status: 200,
              }),
            ),
          ),
        ),
        () => Promise.resolve(["93.184.216.34"]),
      ),
    );

    assertRssFailure(exit, RssFeedTooLargeError);
  }),
);

it.effect("RssClient fails with a typed parse error for invalid RSS payloads", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      fetchFeedItemsEffect(
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response("<rss><channel></channel></rss>", {
                headers: { "content-type": "application/xml" },
                status: 200,
              }),
            ),
          ),
        ),
        () => Promise.resolve(["93.184.216.34"]),
      ),
    );

    assertRssFailure(exit, RssFeedParseError);
  }),
);

it.effect("RssClient fails when an RSS item is missing required release fields", () =>
  Effect.gen(function* () {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel>
    <item>
      <title>[SubsPlease] Example Show - 01 (1080p)</title>
      <link>https://nyaa.si/download/123456.torrent</link>
      <nyaa:size>1.2 GiB</nyaa:size>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <nyaa:seeders>34</nyaa:seeders>
      <nyaa:leechers>12</nyaa:leechers>
      <nyaa:trusted>Yes</nyaa:trusted>
      <nyaa:remake>No</nyaa:remake>
    </item>
  </channel>
</rss>`;

    const exit = yield* Effect.exit(
      fetchFeedItemsEffect(
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(xml, {
                headers: { "content-type": "application/rss+xml" },
                status: 200,
              }),
            ),
          ),
        ),
        () => Promise.resolve(["93.184.216.34"]),
      ),
    );

    assertRssFailure(exit, RssFeedParseError, /invalid|required/i);
  }),
);

it.scoped("RssClient handles redirects manually when the transport returns 302 responses", () =>
  Effect.gen(function* () {
    const calls: string[] = [];

    const exit = yield* Effect.exit(
      Effect.flatMap(RssClient, (client) =>
        client.fetchItems("https://feeds.example/releases.xml"),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            ClockServiceLive,
            RssClientLive.pipe(
              Layer.provide(
                Layer.mergeAll(
                  ClockServiceLive,
                  Layer.succeed(
                    HttpClient.HttpClient,
                    HttpClient.make((request, url) => {
                      calls.push(url.toString());

                      if (url.href.includes("feeds.example")) {
                        return Effect.succeed(
                          HttpClientResponse.fromWeb(
                            request,
                            new Response("", {
                              headers: {
                                "content-type": "application/rss+xml",
                                location: "http://192.168.1.100/private.xml",
                              },
                              status: 302,
                            }),
                          ),
                        );
                      }

                      return Effect.succeed(
                        HttpClientResponse.fromWeb(
                          request,
                          new Response("", {
                            headers: { "content-type": "application/rss+xml" },
                            status: 200,
                          }),
                        ),
                      );
                    }),
                  ),
                  makeDnsLayer(() => Promise.resolve(["93.184.216.34"])),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    assertRssFailure(exit, RssFeedRejectedError, /private|loopback|link-local|ssrf/i);
    assert.deepStrictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], "https://feeds.example/releases.xml");
  }),
);

function fetchFeedItemsEffect(
  httpClient: HttpClient.HttpClient,
  dnsMock: (name: string, type: "A" | "AAAA") => Promise<string[]>,
) {
  return Effect.flatMap(RssClient, (client) =>
    client.fetchItems("https://feeds.example/releases.xml"),
  ).pipe(Effect.provide(Layer.mergeAll(rssLayer(httpClient, dnsMock), ClockServiceLive)));
}

function assertRssFailure(
  exit: Exit.Exit<
    readonly unknown[],
    RssFeedParseError | RssFeedRejectedError | RssFeedTooLargeError | ExternalCallError
  >,
  expected: typeof RssFeedParseError | typeof RssFeedRejectedError | typeof RssFeedTooLargeError,
  message?: RegExp,
) {
  assert.deepStrictEqual(Exit.isFailure(exit), true);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    assert.deepStrictEqual(failure._tag, "Some");
    if (failure._tag === "Some") {
      assert.deepStrictEqual(failure.value instanceof expected, true);
      if (message) {
        assert.match(failure.value.message, message);
      }
    }
  }
}
