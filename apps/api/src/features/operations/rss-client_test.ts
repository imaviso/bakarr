import { assertEquals } from "@std/assert";
import { HttpClient, HttpClientResponse } from "@effect/platform";
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
        isSeaDex: true,
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
