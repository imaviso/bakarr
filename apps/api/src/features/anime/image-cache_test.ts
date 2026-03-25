import { assertEquals, it } from "../../test/vitest.ts";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Exit } from "effect";

import { exists, withFileSystemSandboxEffect } from "../../test/filesystem-test.ts";
import { cacheAnimeMetadataImages } from "./image-cache.ts";

it.scoped("cacheAnimeMetadataImages uses provided HttpClient for remote images", () =>
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

    yield* withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const imageBytes = Uint8Array.from([137, 80, 78, 71]);
        const client = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(imageBytes, {
                headers: { "content-type": "image/png" },
                status: 200,
              }),
            ),
          ),
        );

        const result = yield* cacheAnimeMetadataImages(fs, client, root, 55, {
          coverImage: "https://example.com/cover",
        });

        assertEquals(result.coverImage, "/api/images/anime/55/cover.png");
        assertEquals(yield* exists(fs, `${root}/anime/55/cover.png`), true);
      }),
    );
  }),
);

it.scoped("cacheAnimeMetadataImages saves cover and banner files locally", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
      const result = yield* cacheAnimeMetadataImages(fs, clientFromFetch(), root, 99, {
        bannerImage: dataUrl,
        coverImage: dataUrl,
      });

      assertEquals(result.coverImage, "/api/images/anime/99/cover.png");
      assertEquals(result.bannerImage, "/api/images/anime/99/banner.png");
      assertEquals(yield* exists(fs, `${root}/anime/99/cover.png`), true);
      assertEquals(yield* exists(fs, `${root}/anime/99/banner.png`), true);
    }),
  ),
);

it.scoped("cacheAnimeMetadataImages fails on unsupported image types", () =>
  Effect.gen(function* () {
    const originalFetch = globalThis.fetch;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      }),
    );
    yield* Effect.sync(() => {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response("not-an-image", {
            headers: { "content-type": "text/plain" },
            status: 200,
          }),
        )) as unknown as typeof fetch;
    });

    yield* withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const coverUrl = "https://example.com/cover";
        const bannerUrl = "https://example.com/banner";
        const result = yield* Effect.exit(
          cacheAnimeMetadataImages(fs, clientFromFetch(), root, 77, {
            bannerImage: bannerUrl,
            coverImage: coverUrl,
          }),
        );

        assertEquals(Exit.isFailure(result), true);
        assertEquals(yield* exists(fs, `${root}/anime/77/cover.png`), false);
        assertEquals(yield* exists(fs, `${root}/anime/77/banner.png`), false);
      }),
    );
  }),
);

it.scoped("cacheAnimeMetadataImages fails oversized images by Content-Length", () =>
  Effect.gen(function* () {
    const originalFetch = globalThis.fetch;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      }),
    );
    yield* Effect.sync(() => {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response("x".repeat(100), {
            headers: {
              "content-type": "image/png",
              "content-length": "15000000",
            },
            status: 200,
          }),
        )) as unknown as typeof fetch;
    });

    yield* withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const coverUrl = "https://example.com/huge.png";
        const result = yield* Effect.exit(
          cacheAnimeMetadataImages(fs, clientFromFetch(), root, 77, {
            coverImage: coverUrl,
          }),
        );

        assertEquals(Exit.isFailure(result), true);
        assertEquals(yield* exists(fs, `${root}/anime/77/cover.png`), false);
      }),
    );
  }),
);

it.scoped("cacheAnimeMetadataImages fails oversized images by streamed bytes", () =>
  Effect.gen(function* () {
    const originalFetch = globalThis.fetch;
    const largeBody = new Uint8Array(11 * 1024 * 1024);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(largeBody);
        controller.close();
      },
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      }),
    );
    yield* Effect.sync(() => {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(stream, {
            headers: { "content-type": "image/png" },
            status: 200,
          }),
        )) as unknown as typeof fetch;
    });

    yield* withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const coverUrl = "https://example.com/huge-stream.png";
        const result = yield* Effect.exit(
          cacheAnimeMetadataImages(fs, clientFromFetch(), root, 77, {
            coverImage: coverUrl,
          }),
        );

        assertEquals(Exit.isFailure(result), true);
        assertEquals(yield* exists(fs, `${root}/anime/77/cover.png`), false);
      }),
    );
  }),
);

function clientFromFetch() {
  return Effect.runSync(HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer)));
}
