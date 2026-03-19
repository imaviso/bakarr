import { HttpClient } from "@effect/platform";
import { Effect, Schema, Stream } from "effect";

import type { FileSystemShape } from "../../lib/filesystem.ts";

export interface CachedAnimeImages {
  readonly bannerImage?: string;
  readonly coverImage?: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

class ImageCacheError extends Schema.TaggedError<ImageCacheError>()(
  "ImageCacheError",
  { cause: Schema.Defect, message: Schema.String },
) {}

class ImageTooLargeError extends Schema.TaggedError<ImageTooLargeError>()(
  "ImageTooLargeError",
  { contentLength: Schema.optional(Schema.Number), maxBytes: Schema.Number },
) {}

export const cacheAnimeMetadataImages = Effect.fn(
  "AnimeService.cacheAnimeMetadataImages",
)(function* (
  fs: FileSystemShape,
  client: HttpClient.HttpClient,
  imagesRoot: string,
  animeId: number,
  images: CachedAnimeImages,
) {
  const baseDir = `${imagesRoot.replace(/\/$/, "")}/anime/${animeId}`;

  yield* fs.mkdir(baseDir, { recursive: true });

  const coverImage = yield* cacheAnimeImage(
    fs,
    client,
    baseDir,
    animeId,
    "cover",
    images.coverImage,
  ).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("Failed to cache cover image").pipe(
        Effect.annotateLogs({ animeId, error }),
      )
    ),
    Effect.catchAll(() => Effect.succeed(images.coverImage)),
  );
  const bannerImage = yield* cacheAnimeImage(
    fs,
    client,
    baseDir,
    animeId,
    "banner",
    images.bannerImage,
  ).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("Failed to cache banner image").pipe(
        Effect.annotateLogs({ animeId, error }),
      )
    ),
    Effect.catchAll(() => Effect.succeed(images.bannerImage)),
  );

  return { bannerImage, coverImage } satisfies CachedAnimeImages;
});

const cacheAnimeImage = Effect.fn("AnimeService.cacheAnimeImage")(
  function* (
    fs: FileSystemShape,
    client: HttpClient.HttpClient,
    baseDir: string,
    animeId: number,
    kind: "banner" | "cover",
    url: string | undefined,
  ) {
    if (!url) {
      return undefined;
    }

    const cachedPath = yield* findCachedImagePath(fs, baseDir, animeId, kind);

    if (cachedPath) {
      return cachedPath;
    }

    const download = yield* downloadImage(client, url);
    const filename = `${kind}.${download.extension}`;

    yield* fs.writeFile(`${baseDir}/${filename}`, download.bytes);

    return `/api/images/anime/${animeId}/${filename}`;
  },
);

const findCachedImagePath = Effect.fn("AnimeService.findCachedImagePath")(
  function* (
    fs: FileSystemShape,
    baseDir: string,
    animeId: number,
    kind: "banner" | "cover",
  ) {
    const entries = yield* fs.readDir(baseDir).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    );

    const existing = entries
      .filter((entry) => entry.isFile && entry.name.startsWith(`${kind}.`))
      .map((entry) => entry.name)
      .sort()[0];

    if (!existing) {
      return undefined;
    }

    return `/api/images/anime/${animeId}/${existing}`;
  },
);

const downloadImage = Effect.fn("AnimeService.downloadImage")(function* (
  client: HttpClient.HttpClient,
  url: string,
) {
  const response = yield* client.get(url).pipe(
    Effect.mapError((cause) =>
      new ImageCacheError({ cause, message: "Failed to download image" })
    ),
  );

  if (response.status < 200 || response.status >= 300) {
    return yield* new ImageCacheError({
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

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  yield* response.stream.pipe(
    Stream.mapError((cause) =>
      new ImageCacheError({ cause, message: "Failed to read image stream" })
    ),
    Stream.runForEach((chunk) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        return Effect.fail(
          new ImageTooLargeError({
            contentLength: undefined,
            maxBytes: MAX_IMAGE_BYTES,
          }),
        );
      }
      chunks.push(chunk);
      return Effect.void;
    }),
  );

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const extension = inferImageExtension(
    url,
    response.headers["content-type"] ?? null,
  );

  if (!extension) {
    return yield* new ImageCacheError({
      cause: response,
      message: "Unsupported image type",
    });
  }

  return { bytes, extension };
});

function inferImageExtension(url: string, contentType: string | null) {
  const normalizedType = contentType?.split(";")[0].trim().toLowerCase();

  switch (normalizedType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
  }

  try {
    const pathname = new URL(url).pathname.toLowerCase();

    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "jpg";
    if (pathname.endsWith(".png")) return "png";
    if (pathname.endsWith(".webp")) return "webp";
    if (pathname.endsWith(".gif")) return "gif";
    if (pathname.endsWith(".svg")) return "svg";
  } catch {
    return undefined;
  }

  return undefined;
}
