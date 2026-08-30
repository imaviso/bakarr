// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { HttpClient } from "@effect/platform";
import { Effect, Option, Schema } from "effect";

import { collectBoundedBytes } from "@/infra/effect/bounded-stream.ts";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";

export { ImageCacheError };

export interface CachedMediaImages {
  readonly bannerImage?: string | undefined;
  readonly coverImage?: string | undefined;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_DOWNLOAD_TIMEOUT = "30 seconds";

const CachedImageSidecarSchema = Schema.Struct({
  sourceUrl: Schema.String,
});

const CachedImageSidecarJsonSchema = Schema.parseJson(CachedImageSidecarSchema);

export class ImageTooLargeError extends Schema.TaggedError<ImageTooLargeError>()(
  "ImageTooLargeError",
  {
    cause: Schema.optional(Schema.Defect),
    contentLength: Schema.optional(Schema.Number),
    maxBytes: Schema.Number,
  },
) {}

export const cacheMediaMetadataImages = Effect.fn("MediaService.cacheMediaMetadataImages")(
  function* (
    fs: FileSystemShape,
    client: HttpClient.HttpClient,
    imagesRoot: string,
    mediaId: number,
    images: CachedMediaImages,
  ) {
    const baseDir = `${imagesRoot.replace(/\/$/, "")}/media/${mediaId}`;

    yield* fs.mkdir(baseDir, { recursive: true });

    const withImageCacheWarning = (kind: "cover" | "banner") =>
      Effect.tapError((error: unknown) =>
        Effect.logWarning(`Failed to cache ${kind} image`).pipe(
          Effect.annotateLogs({ mediaId, error }),
        ),
      );

    const coverImage = yield* cacheMediaImage(
      fs,
      client,
      baseDir,
      mediaId,
      "cover",
      images.coverImage,
    ).pipe(withImageCacheWarning("cover"));
    const bannerImage = yield* cacheMediaImage(
      fs,
      client,
      baseDir,
      mediaId,
      "banner",
      images.bannerImage,
    ).pipe(withImageCacheWarning("banner"));

    return { bannerImage, coverImage } satisfies CachedMediaImages;
  },
);

const cacheMediaImage = Effect.fn("MediaImageCache.cacheMediaImage")(function* (
  fs: FileSystemShape,
  client: HttpClient.HttpClient,
  baseDir: string,
  mediaId: number,
  kind: "banner" | "cover",
  url: string | undefined,
) {
  if (!url) {
    return undefined;
  }

  const cachedPath = yield* findCachedImagePath(fs, baseDir, mediaId, kind, url);

  if (cachedPath) {
    return cachedPath;
  }

  const download = yield* downloadImage(client, url, mediaId);
  const filename = `${kind}.${download.extension}`;

  // Concurrent callers for same media/kind may both miss cache and download
  // in parallel; last write wins and sidecar ensures the winner's URL is
  // recorded. Extra bandwidth is acceptable for single-user LAN.
  yield* fs.writeFile(`${baseDir}/${filename}`, download.bytes);

  // Sidecar records the source URL so a changed provider URL triggers a
  // re-download instead of serving the stale image forever.
  yield* writeCachedImageSidecar(fs, baseDir, kind, url);

  return `/api/images/media/${mediaId}/${filename}`;
});

const CACHED_IMAGE_EXTENSIONS: readonly string[] = ["jpg", "png", "webp", "gif"];

const findCachedImagePath = Effect.fn("MediaService.findCachedImagePath")(function* (
  fs: FileSystemShape,
  baseDir: string,
  mediaId: number,
  kind: "banner" | "cover",
  sourceUrl: string,
) {
  for (const extension of CACHED_IMAGE_EXTENSIONS) {
    const fileName = `${kind}.${extension}`;
    const statResult = yield* fs
      .stat(`${baseDir}/${fileName}`)
      .pipe(
        Effect.catchTag("FileSystemError", (error) =>
          isNotFoundError(error) ? Effect.succeed(undefined) : Effect.fail(error),
        ),
      );

    if (!statResult?.isFile) {
      continue;
    }

    if (yield* cachedImageSidecarMatches(fs, baseDir, kind, sourceUrl)) {
      return `/api/images/media/${mediaId}/${fileName}`;
    }
  }

  return undefined;
});

const cachedImageSidecarMatches = Effect.fn("MediaImageCache.sidecarMatches")(function* (
  fs: FileSystemShape,
  baseDir: string,
  kind: "banner" | "cover",
  sourceUrl: string,
) {
  const bytes = yield* fs
    .readFile(`${baseDir}/${kind}.json`)
    .pipe(
      Effect.catchTag("FileSystemError", (error) =>
        isNotFoundError(error) ? Effect.succeed(undefined) : Effect.fail(error),
      ),
    );

  if (!bytes) {
    // No sidecar: legacy cache entry — treat as stale so it refreshes once.
    return false;
  }

  const sidecar = yield* Schema.decodeUnknown(CachedImageSidecarJsonSchema)(
    new TextDecoder().decode(bytes),
  ).pipe(Effect.orElseSucceed(() => undefined));

  return sidecar !== undefined && sidecar.sourceUrl === sourceUrl;
});

const writeCachedImageSidecar = Effect.fn("MediaImageCache.writeSidecar")(function* (
  fs: FileSystemShape,
  baseDir: string,
  kind: "banner" | "cover",
  sourceUrl: string,
) {
  const json = yield* Schema.encode(CachedImageSidecarJsonSchema)({ sourceUrl });

  yield* fs.writeFile(`${baseDir}/${kind}.json`, new TextEncoder().encode(json)).pipe(
    // A missing sidecar only costs one extra refresh — never fail the caching.
    Effect.catchAll(() => Effect.void),
  );
});

const downloadImage = Effect.fn("MediaService.downloadImage")(
  (client: HttpClient.HttpClient, url: string, mediaId: number) =>
    Effect.gen(function* () {
      const response = yield* client
        .get(url)
        .pipe(
          Effect.mapError(
            (cause) => new ImageCacheError({ mediaId, cause, message: "Failed to download image" }),
          ),
        );

      if (response.status < 200 || response.status >= 300) {
        return yield* new ImageCacheError({
          mediaId,
          cause: response,
          message: `Image download failed with status ${response.status}`,
        });
      }

      const contentLength = response.headers["content-length"];
      if (contentLength) {
        const length = Number.parseInt(contentLength, 10);
        if (!Number.isNaN(length) && length > MAX_IMAGE_BYTES) {
          return yield* new ImageTooLargeError({
            contentLength: length,
            maxBytes: MAX_IMAGE_BYTES,
          });
        }
      }

      const bytes = yield* collectBoundedBytes(response.stream, MAX_IMAGE_BYTES).pipe(
        Effect.mapError(
          (cause) =>
            new ImageTooLargeError({
              cause,
              contentLength: undefined,
              maxBytes: MAX_IMAGE_BYTES,
            }),
        ),
      );

      const extension = inferImageExtension(url, response.headers["content-type"] ?? null);

      if (!extension) {
        return yield* new ImageCacheError({
          mediaId,
          cause: response,
          message: "Unsupported image type",
        });
      }

      return { bytes, extension };
    }).pipe(
      Effect.timeout(IMAGE_DOWNLOAD_TIMEOUT),
      Effect.catchTag("TimeoutException", (cause) =>
        Effect.fail(new ImageCacheError({ mediaId, cause, message: "Image download timed out" })),
      ),
    ),
);

function inferImageExtension(url: string, contentType: string | null): string | undefined {
  const [mediaType] = contentType?.split(";") ?? [];
  const normalizedType = mediaType?.trim().toLowerCase();

  switch (normalizedType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
  }

  return Option.getOrElse(
    Option.liftThrowable(() => {
      const pathname = new URL(url).pathname.toLowerCase();

      if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "jpg";
      if (pathname.endsWith(".png")) return "png";
      if (pathname.endsWith(".webp")) return "webp";
      if (pathname.endsWith(".gif")) return "gif";

      return undefined;
    })(),
    () => undefined,
  );
}
