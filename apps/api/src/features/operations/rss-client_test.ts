import { assertEquals, it } from "../../test/vitest.ts";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";

import { DnsLookupError, DnsResolver } from "../../lib/dns-resolver.ts";
import { RssClient, RssClientLive } from "./rss-client.ts";

function makeDnsLayer(
  mock: (name: string, type: "A" | "AAAA") => Promise<string[]>,
) {
  return Layer.succeed(DnsResolver, {
    resolve: (hostname, recordType) =>
      Effect.tryPromise({
        try: () => mock(hostname, recordType),
        catch: (cause) => new DnsLookupError({ cause, hostname, recordType }),
      }),
  });
}

function makeNotFoundError() {
  const error = new Error("Not found") as Error & { code?: string };
  error.name = "NotFound";
  error.code = "NotFound";
  return error;
}

function rssLayer(
  httpClient: HttpClient.HttpClient,
  dnsMock: (name: string, type: "A" | "AAAA") => Promise<string[]>,
) {
  return RssClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient, httpClient),
        makeDnsLayer(dnsMock),
      ),
    ),
  );
}

it.effect("RssClient uses provided HttpClient for feed fetches", () =>
  Effect.gen(function* () {
    const items = yield* fetchFeedItemsEffect(
      makeRssHttpClient(),
      (_name, type) =>
        type === "A"
          ? Promise.resolve(["93.184.216.34"])
          : Promise.reject(makeNotFoundError()),
    );

    assertEquals(items, [
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
  })
);

it.effect("RssClient blocks feeds that resolve to private IPv6 addresses", () =>
  Effect.gen(function* () {
    let httpCalled = false;

    const items = yield* fetchFeedItemsEffect(
      makeTrackingHttpClient(() => {
        httpCalled = true;
      }),
      (_name, type) =>
        type === "AAAA"
          ? Promise.resolve(["fd00::1"])
          : Promise.reject(makeNotFoundError()),
    );

    assertEquals(items, []);
    assertEquals(httpCalled, false);
  })
);

it.effect("RssClient blocks feeds when DNS resolution fails", () =>
  Effect.gen(function* () {
    let httpCalled = false;

    const items = yield* fetchFeedItemsEffect(
      makeTrackingHttpClient(() => {
        httpCalled = true;
      }),
      () => Promise.reject(new Error("SERVFAIL")),
    );

    assertEquals(items, []);
    assertEquals(httpCalled, false);
  })
);

it.effect("RssClient blocks public URL redirecting to private IP", () =>
  Effect.gen(function* () {
    let requestCount = 0;

    const items = yield* fetchFeedItemsEffect(
      makeRedirectHttpClient(
        () => requestCount++,
        "http://192.168.1.1/private.xml",
      ),
      (_name, type) =>
        type === "A"
          ? Promise.resolve(["93.184.216.34"])
          : Promise.reject(makeNotFoundError()),
    );

    assertEquals(items, []);
    assertEquals(
      requestCount,
      1,
      "Should only make initial request, not follow redirect",
    );
  })
);

it.effect("RssClient blocks chained redirect where second hop becomes private", () =>
  Effect.gen(function* () {
    let requestCount = 0;
    const redirectChain: string[] = [];

    const items = yield* fetchFeedItemsEffect(
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
    );

    assertEquals(items, []);
    assertEquals(
      redirectChain.length,
      1,
      "Should reach redirect but block on private IP",
    );
    assertEquals(requestCount, 1);
  })
);

it.effect("RssClient aborts redirect loops safely", () =>
  Effect.gen(function* () {
    let requestCount = 0;
    const visitedUrls: string[] = [];

    const items = yield* fetchFeedItemsEffect(
      makeLoopingRedirectHttpClient(
        () => {
          requestCount++;
        },
        (url) => visitedUrls.push(url),
      ),
      () => Promise.resolve(["93.184.216.34"]),
    );

    assertEquals(items, []);
    assertEquals(
      requestCount <= 6,
      true,
      "Should stop at max redirect hops (5 + initial)",
    );
  })
);

it.effect("RssClient handles non-redirect valid feed", () =>
  Effect.gen(function* () {
    const items = yield* fetchFeedItemsEffect(
      makeRssHttpClient(),
      () => Promise.resolve(["93.184.216.34"]),
    );

    assertEquals(items.length, 1);
    assertEquals(
      items[0].title,
      "[SubsPlease] Example Show - 01 (1080p) [SeaDex]",
    );
  })
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
    )
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

function makeRedirectHttpClient(
  onRequest: () => void,
  redirectLocation: string,
) {
  return HttpClient.make((request) => {
    onRequest();

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("", {
          headers: {
            "content-type": "application/rss+xml",
            "location": redirectLocation,
          },
          status: 302,
        }),
      ),
    );
  });
}

function makeChainedRedirectHttpClient(
  onRequest: () => void,
  onRedirect: (url: string) => void,
) {
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
              "location": "https://private.example/redirect.xml",
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

function makeLoopingRedirectHttpClient(
  onRequest: () => void,
  onVisit: (url: string) => void,
) {
  return HttpClient.make((request) => {
    onRequest();
    onVisit(request.url);

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("", {
          headers: {
            "content-type": "application/rss+xml",
            "location": "https://feeds.example/loop1.xml",
          },
          status: 302,
        }),
      ),
    );
  });
}

it.effect("RssClient accepts feeds under byte cap", () =>
  Effect.gen(function* () {
    const smallFeed =
      `<?xml version="1.0"?><rss><channel><item><title>Test</title></item></channel></rss>`;

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
        )
      ),
      () => Promise.resolve(["93.184.216.34"]),
    );

    assertEquals(items.length, 1);
  })
);

it.effect("RssClient rejects feeds over byte cap", () =>
  Effect.gen(function* () {
    const largeFeed = "x".repeat(11 * 1024 * 1024);

    const items = yield* fetchFeedItemsEffect(
      HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(largeFeed, {
              headers: { "content-type": "application/xml" },
              status: 200,
            }),
          ),
        )
      ),
      () => Promise.resolve(["93.184.216.34"]),
    );

    assertEquals(items, []);
  })
);

it.scoped("RssClient disables automatic redirect following for fetch client", () =>
  Effect.gen(function* () {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ redirect?: RequestRedirect; url: string }> = [];

    globalThis.fetch = ((input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      const requestInit = (init ?? {}) as globalThis.RequestInit;
      calls.push({ redirect: requestInit.redirect, url });

      if (url.includes("feeds.example")) {
        return Promise.resolve(
          new Response("", {
            headers: {
              "content-type": "application/rss+xml",
              "location": "http://192.168.1.100/private.xml",
            },
            status: 302,
          }),
        );
      }

      return Promise.resolve(
        new Response("", {
          headers: { "content-type": "application/rss+xml" },
          status: 200,
        }),
      );
    }) as typeof fetch;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      })
    );

    const items = yield* Effect.flatMap(
      RssClient,
      (client) => client.fetchItems("https://feeds.example/releases.xml"),
    ).pipe(
      Effect.provide(
        RssClientLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              FetchHttpClient.layer,
              makeDnsLayer(
                () => Promise.resolve(["93.184.216.34"]),
              ),
            ),
          ),
        ),
      ),
    );

    assertEquals(items, []);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].redirect, "manual");
  })
);

function fetchFeedItemsEffect(
  httpClient: HttpClient.HttpClient,
  dnsMock: (name: string, type: "A" | "AAAA") => Promise<string[]>,
) {
  return Effect.flatMap(
    RssClient,
    (client) => client.fetchItems("https://feeds.example/releases.xml"),
  ).pipe(Effect.provide(rssLayer(httpClient, dnsMock)));
}
