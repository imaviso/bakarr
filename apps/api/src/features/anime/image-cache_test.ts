import { assert, it } from "@effect/vitest";
import { HttpClient, HttpClientError, HttpClientResponse } from "@effect/platform";
import { Cause, Effect, Exit } from "effect";

import { exists, withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";
import {
  cacheAnimeMetadataImages,
  ImageCacheError,
  ImageTooLargeError,
} from "@/features/anime/image-cache.ts";

it.scoped("cacheAnimeMetadataImages uses provided HttpClient for remote images", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const imageBytes = Uint8Array.from([137, 80, 78, 71]);
      let requestCount = 0;
      const client = makeImageHttpClient(() => {
        requestCount += 1;
        return new Response(imageBytes, {
          headers: { "content-type": "image/png" },
          status: 200,
        });
      });

      const result = yield* cacheAnimeMetadataImages(fs, client, root, 55, {
        coverImage: "https://example.com/cover",
      });

      assert.deepStrictEqual(result.coverImage, "/api/images/anime/55/cover.png");
      assert.deepStrictEqual(yield* exists(fs, `${root}/anime/55/cover.png`), true);
      assert.deepStrictEqual(requestCount, 1);
    }),
  ),
);

it.scoped("cacheAnimeMetadataImages saves cover and banner files locally", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
      const result = yield* cacheAnimeMetadataImages(fs, makeImageHttpClient(), root, 99, {
        bannerImage: dataUrl,
        coverImage: dataUrl,
      });

      assert.deepStrictEqual(result.coverImage, "/api/images/anime/99/cover.png");
      assert.deepStrictEqual(result.bannerImage, "/api/images/anime/99/banner.png");
      assert.deepStrictEqual(yield* exists(fs, `${root}/anime/99/cover.png`), true);
      assert.deepStrictEqual(yield* exists(fs, `${root}/anime/99/banner.png`), true);
    }),
  ),
);

it.scoped("cacheAnimeMetadataImages fails on unsupported image types", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const coverUrl = "https://example.com/cover";
      const bannerUrl = "https://example.com/banner";
      const result = yield* Effect.exit(
        cacheAnimeMetadataImages(
          fs,
          makeImageHttpClient(
            () =>
              new Response("not-an-image", {
                headers: { "content-type": "text/plain" },
                status: 200,
              }),
          ),
          root,
          77,
          {
            bannerImage: bannerUrl,
            coverImage: coverUrl,
          },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(result), true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some" && failure.value instanceof ImageCacheError) {
          assert.deepStrictEqual(failure.value.message, "Unsupported image type");
        }
      }
      assert.deepStrictEqual(yield* exists(fs, `${root}/anime/77/cover.png`), false);
      assert.deepStrictEqual(yield* exists(fs, `${root}/anime/77/banner.png`), false);
    }),
  ),
);

it.scoped("cacheAnimeMetadataImages fails oversized images by Content-Length", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const coverUrl = "https://example.com/huge.png";
      const result = yield* Effect.exit(
        cacheAnimeMetadataImages(
          fs,
          makeImageHttpClient(
            () =>
              new Response("x".repeat(100), {
                headers: {
                  "content-type": "image/png",
                  "content-length": "15000000",
                },
                status: 200,
              }),
          ),
          root,
          77,
          {
            coverImage: coverUrl,
          },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(result), true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some" && failure.value instanceof ImageTooLargeError) {
          assert.deepStrictEqual(failure.value.contentLength, 15000000);
        }
      }
      assert.deepStrictEqual(yield* exists(fs, `${root}/anime/77/cover.png`), false);
    }),
  ),
);

it.scoped("cacheAnimeMetadataImages fails oversized images by streamed bytes", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const largeBody = new Uint8Array(11 * 1024 * 1024);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(largeBody);
          controller.close();
        },
      });
      const coverUrl = "https://example.com/huge-stream.png";
      const result = yield* Effect.exit(
        cacheAnimeMetadataImages(
          fs,
          makeImageHttpClient(
            () =>
              new Response(stream, {
                headers: { "content-type": "image/png" },
                status: 200,
              }),
          ),
          root,
          77,
          {
            coverImage: coverUrl,
          },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(result), true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some" && failure.value instanceof ImageTooLargeError) {
          assert.deepStrictEqual(failure.value.contentLength, undefined);
        }
      }
      assert.deepStrictEqual(yield* exists(fs, `${root}/anime/77/cover.png`), false);
    }),
  ),
);

function makeImageHttpClient(
  createResponse?: (url: string) => Response | Promise<Response> | undefined,
) {
  return HttpClient.make((request) =>
    Effect.tryPromise({
      try: async () => {
        const response = createResponse
          ? await createResponse(request.url)
          : await fetch(request.url);
        if (!response) {
          throw new Error(`missing response for ${request.url}`);
        }

        return HttpClientResponse.fromWeb(request, response);
      },
      catch: (cause) =>
        new HttpClientError.RequestError({
          request,
          reason: "Transport",
          cause,
          description: "image client request failed",
        }),
    }),
  );
}
