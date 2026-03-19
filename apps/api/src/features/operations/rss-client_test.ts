import { assertEquals } from "@std/assert";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";

import { RssClient, RssClientLive } from "./rss-client.ts";

Deno.test("RssClient uses provided HttpClient for feed fetches", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const items = await withMockResolveDns(
      (_name, type) =>
        type === "A"
          ? Promise.resolve(["93.184.216.34"])
          : Promise.reject(new Deno.errors.NotFound()),
      () =>
        Effect.runPromise(
          Effect.flatMap(
            RssClient,
            (client) => client.fetchItems("https://feeds.example/releases.xml"),
          ).pipe(
            Effect.provide(
              RssClientLive.pipe(
                Layer.provide(
                  Layer.succeed(HttpClient.HttpClient, makeRssHttpClient()),
                ),
              ),
            ),
          ),
        ),
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RssClient blocks feeds that resolve to private IPv6 addresses", async () => {
  let httpCalled = false;

  const items = await withMockResolveDns(
    (_name, type) =>
      type === "AAAA"
        ? Promise.resolve(["fd00::1"])
        : Promise.reject(new Deno.errors.NotFound()),
    () =>
      Effect.runPromise(
        Effect.flatMap(
          RssClient,
          (client) => client.fetchItems("https://feeds.example/releases.xml"),
        ).pipe(
          Effect.provide(
            RssClientLive.pipe(
              Layer.provide(
                Layer.succeed(
                  HttpClient.HttpClient,
                  makeTrackingHttpClient(() => {
                    httpCalled = true;
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
  );

  assertEquals(items, []);
  assertEquals(httpCalled, false);
});

Deno.test("RssClient blocks feeds when DNS resolution fails", async () => {
  let httpCalled = false;

  const items = await withMockResolveDns(
    () => Promise.reject(new Error("SERVFAIL")),
    () =>
      Effect.runPromise(
        Effect.flatMap(
          RssClient,
          (client) => client.fetchItems("https://feeds.example/releases.xml"),
        ).pipe(
          Effect.provide(
            RssClientLive.pipe(
              Layer.provide(
                Layer.succeed(
                  HttpClient.HttpClient,
                  makeTrackingHttpClient(() => {
                    httpCalled = true;
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
  );

  assertEquals(items, []);
  assertEquals(httpCalled, false);
});

Deno.test("RssClient blocks public URL redirecting to private IP", async () => {
  let requestCount = 0;

  const items = await withMockResolveDns(
    (_name, type) =>
      type === "A"
        ? Promise.resolve(["93.184.216.34"])
        : Promise.reject(new Deno.errors.NotFound()),
    () =>
      Effect.runPromise(
        Effect.flatMap(
          RssClient,
          (client) => client.fetchItems("https://feeds.example/releases.xml"),
        ).pipe(
          Effect.provide(
            RssClientLive.pipe(
              Layer.provide(
                Layer.succeed(
                  HttpClient.HttpClient,
                  makeRedirectHttpClient(
                    () => requestCount++,
                    "http://192.168.1.1/private.xml",
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
  );

  assertEquals(items, []);
  assertEquals(
    requestCount,
    1,
    "Should only make initial request, not follow redirect",
  );
});

Deno.test("RssClient blocks chained redirect where second hop becomes private", async () => {
  let requestCount = 0;
  const redirectChain: string[] = [];

  const items = await withMockResolveDns(
    (name, type) => {
      if (name === "private.example") {
        return type === "A"
          ? Promise.resolve(["10.0.0.1"])
          : Promise.reject(new Deno.errors.NotFound());
      }
      return type === "A"
        ? Promise.resolve(["93.184.216.34"])
        : Promise.reject(new Deno.errors.NotFound());
    },
    () =>
      Effect.runPromise(
        Effect.flatMap(
          RssClient,
          (client) => client.fetchItems("https://feeds.example/releases.xml"),
        ).pipe(
          Effect.provide(
            RssClientLive.pipe(
              Layer.provide(
                Layer.succeed(
                  HttpClient.HttpClient,
                  makeChainedRedirectHttpClient(
                    () => {
                      requestCount++;
                    },
                    (url) => redirectChain.push(url),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
  );

  assertEquals(items, []);
  assertEquals(
    redirectChain.length,
    1,
    "Should reach redirect but block on private IP",
  );
});

Deno.test("RssClient aborts redirect loops safely", async () => {
  let requestCount = 0;
  const visitedUrls: string[] = [];

  const items = await withMockResolveDns(
    () => Promise.resolve(["93.184.216.34"]),
    () =>
      Effect.runPromise(
        Effect.flatMap(
          RssClient,
          (client) => client.fetchItems("https://feeds.example/releases.xml"),
        ).pipe(
          Effect.provide(
            RssClientLive.pipe(
              Layer.provide(
                Layer.succeed(
                  HttpClient.HttpClient,
                  makeLoopingRedirectHttpClient(
                    () => {
                      requestCount++;
                    },
                    (url) => visitedUrls.push(url),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
  );

  assertEquals(items, []);
  assertEquals(
    requestCount <= 6,
    true,
    "Should stop at max redirect hops (5 + initial)",
  );
});

Deno.test("RssClient handles non-redirect valid feed", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const items = await withMockResolveDns(
      () => Promise.resolve(["93.184.216.34"]),
      () =>
        Effect.runPromise(
          Effect.flatMap(
            RssClient,
            (client) => client.fetchItems("https://feeds.example/releases.xml"),
          ).pipe(
            Effect.provide(
              RssClientLive.pipe(
                Layer.provide(
                  Layer.succeed(HttpClient.HttpClient, makeRssHttpClient()),
                ),
              ),
            ),
          ),
        ),
    );

    assertEquals(items.length, 1);
    assertEquals(
      items[0].title,
      "[SubsPlease] Example Show - 01 (1080p) [SeaDex]",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

async function withMockResolveDns<T>(
  mock: (name: string, type: "A" | "AAAA") => Promise<string[]>,
  run: () => Promise<T>,
) {
  const descriptor = Object.getOwnPropertyDescriptor(Deno, "resolveDns");

  Object.defineProperty(Deno, "resolveDns", {
    configurable: true,
    value: mock,
    writable: true,
  });

  try {
    return await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(Deno, "resolveDns", descriptor);
    }
  }
}

Deno.test("RssClient accepts feeds under byte cap", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const smallFeed =
      `<?xml version="1.0"?><rss><channel><item><title>Test</title></item></channel></rss>`;

    const items = await withMockResolveDns(
      () => Promise.resolve(["93.184.216.34"]),
      () =>
        Effect.runPromise(
          Effect.flatMap(
            RssClient,
            (client) => client.fetchItems("https://feeds.example/releases.xml"),
          ).pipe(
            Effect.provide(
              RssClientLive.pipe(
                Layer.provide(
                  Layer.succeed(
                    HttpClient.HttpClient,
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
                  ),
                ),
              ),
            ),
          ),
        ),
    );

    assertEquals(items.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RssClient rejects feeds over byte cap", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const largeFeed = "x".repeat(11 * 1024 * 1024);

    const items = await withMockResolveDns(
      () => Promise.resolve(["93.184.216.34"]),
      () =>
        Effect.runPromise(
          Effect.flatMap(
            RssClient,
            (client) => client.fetchItems("https://feeds.example/releases.xml"),
          ).pipe(
            Effect.provide(
              RssClientLive.pipe(
                Layer.provide(
                  Layer.succeed(
                    HttpClient.HttpClient,
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
                  ),
                ),
              ),
            ),
          ),
        ),
    );

    assertEquals(items, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RssClient disables automatic redirect following for fetch client", async () => {
  const originalFetch = globalThis.fetch;

  try {
    const calls: Array<{ redirect?: RequestRedirect; url: string }> = [];
    globalThis.fetch = (input, init) => {
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
    };

    const items = await withMockResolveDns(
      () => Promise.resolve(["93.184.216.34"]),
      () =>
        Effect.runPromise(
          Effect.flatMap(
            RssClient,
            (client) => client.fetchItems("https://feeds.example/releases.xml"),
          ).pipe(
            Effect.provide(
              RssClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
            ),
          ),
        ),
    );

    assertEquals(items, []);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].redirect, "manual");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
