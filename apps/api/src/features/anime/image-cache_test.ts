import { assertEquals } from "@std/assert";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "@effect/platform";
import { Effect } from "effect";

import { runTestEffect } from "../../test/effect-test.ts";
import { exists, withFileSystemSandbox } from "../../test/filesystem-test.ts";
import { cacheAnimeMetadataImages } from "./image-cache.ts";

Deno.test("cacheAnimeMetadataImages uses provided HttpClient for remote images", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    await withFileSystemSandbox(async ({ fs, root }) => {
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
        )
      );

      const result = await runTestEffect(
        cacheAnimeMetadataImages(fs, client, root, 55, {
          coverImage: "https://example.com/cover",
        }),
      );

      assertEquals(result.coverImage, "/api/images/anime/55/cover.png");
      assertEquals(
        await runTestEffect(exists(fs, `${root}/anime/55/cover.png`)),
        true,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cacheAnimeMetadataImages saves cover and banner files locally", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const result = await runTestEffect(
      cacheAnimeMetadataImages(fs, clientFromFetch(), root, 99, {
        bannerImage: dataUrl,
        coverImage: dataUrl,
      }),
    );

    assertEquals(result.coverImage, "/api/images/anime/99/cover.png");
    assertEquals(result.bannerImage, "/api/images/anime/99/banner.png");
    assertEquals(
      await runTestEffect(exists(fs, `${root}/anime/99/cover.png`)),
      true,
    );
    assertEquals(
      await runTestEffect(exists(fs, `${root}/anime/99/banner.png`)),
      true,
    );
  });
});

Deno.test("cacheAnimeMetadataImages falls back to original URLs on unsupported image types", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("not-an-image", {
          headers: { "content-type": "text/plain" },
          status: 200,
        }),
      );

    await withFileSystemSandbox(async ({ fs, root }) => {
      const coverUrl = "https://example.com/cover";
      const bannerUrl = "https://example.com/banner";
      const result = await runTestEffect(
        cacheAnimeMetadataImages(fs, clientFromFetch(), root, 77, {
          bannerImage: bannerUrl,
          coverImage: coverUrl,
        }),
      );

      assertEquals(result.coverImage, coverUrl);
      assertEquals(result.bannerImage, bannerUrl);
      assertEquals(
        await runTestEffect(exists(fs, `${root}/anime/77/cover.png`)),
        false,
      );
      assertEquals(
        await runTestEffect(exists(fs, `${root}/anime/77/banner.png`)),
        false,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cacheAnimeMetadataImages rejects oversized images by Content-Length", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("x".repeat(100), {
          headers: {
            "content-type": "image/png",
            "content-length": "15000000",
          },
          status: 200,
        }),
      );

    await withFileSystemSandbox(async ({ fs, root }) => {
      const coverUrl = "https://example.com/huge.png";
      const result = await runTestEffect(
        cacheAnimeMetadataImages(fs, clientFromFetch(), root, 77, {
          coverImage: coverUrl,
        }),
      );

      assertEquals(result.coverImage, coverUrl);
      assertEquals(
        await runTestEffect(exists(fs, `${root}/anime/77/cover.png`)),
        false,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("cacheAnimeMetadataImages rejects oversized images by streamed bytes", async () => {
  const originalFetch = globalThis.fetch;

  try {
    const largeBody = new Uint8Array(11 * 1024 * 1024);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(largeBody);
        controller.close();
      },
    });

    globalThis.fetch = () =>
      Promise.resolve(
        new Response(stream, {
          headers: { "content-type": "image/png" },
          status: 200,
        }),
      );

    await withFileSystemSandbox(async ({ fs, root }) => {
      const coverUrl = "https://example.com/huge-stream.png";
      const result = await runTestEffect(
        cacheAnimeMetadataImages(fs, clientFromFetch(), root, 77, {
          coverImage: coverUrl,
        }),
      );

      assertEquals(result.coverImage, coverUrl);
      assertEquals(
        await runTestEffect(exists(fs, `${root}/anime/77/cover.png`)),
        false,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function clientFromFetch() {
  return Effect.runSync(
    HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer)),
  );
}
