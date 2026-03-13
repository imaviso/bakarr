import { Effect, Schema } from "effect";

import type { FileSystemShape } from "../../lib/filesystem.ts";

export interface CachedAnimeImages {
  readonly bannerImage?: string;
  readonly coverImage?: string;
}

class ImageCacheError extends Schema.TaggedError<ImageCacheError>()(
  "ImageCacheError",
  { cause: Schema.Defect, message: Schema.String },
) {}

export const cacheAnimeMetadataImages = Effect.fn(
  "AnimeService.cacheAnimeMetadataImages",
)(function* (
  fs: FileSystemShape,
  imagesRoot: string,
  animeId: number,
  images: CachedAnimeImages,
) {
  const baseDir = `${imagesRoot.replace(/\/$/, "")}/anime/${animeId}`;

  yield* fs.mkdir(baseDir, { recursive: true });

  const coverImage = yield* cacheAnimeImage(
    fs,
    baseDir,
    animeId,
    "cover",
    images.coverImage,
  ).pipe(Effect.catchAllCause(() => Effect.succeed(images.coverImage)));
  const bannerImage = yield* cacheAnimeImage(
    fs,
    baseDir,
    animeId,
    "banner",
    images.bannerImage,
  ).pipe(Effect.catchAllCause(() => Effect.succeed(images.bannerImage)));

  return { bannerImage, coverImage } satisfies CachedAnimeImages;
});

const cacheAnimeImage = Effect.fn("AnimeService.cacheAnimeImage")(
  function* (
    fs: FileSystemShape,
    baseDir: string,
    animeId: number,
    kind: "banner" | "cover",
    url: string | undefined,
  ) {
    if (!url) {
      return undefined;
    }

    const download = yield* downloadImage(url);
    const filename = `${kind}.${download.extension}`;

    yield* fs.writeFile(`${baseDir}/${filename}`, download.bytes);

    return `/api/images/anime/${animeId}/${filename}`;
  },
);

const downloadImage = Effect.fn("AnimeService.downloadImage")(function* (
  url: string,
) {
  const response = yield* Effect.tryPromise({
    try: () => fetch(url),
    catch: (cause) =>
      new ImageCacheError({ cause, message: "Failed to download image" }),
  });

  if (!response.ok) {
    return yield* new ImageCacheError({
      cause: response,
      message: `Image download failed with status ${response.status}`,
    });
  }

  const bytes = yield* Effect.tryPromise({
    try: async () => new Uint8Array(await response.arrayBuffer()),
    catch: (cause) =>
      new ImageCacheError({ cause, message: "Failed to read image bytes" }),
  });
  const extension = inferImageExtension(
    url,
    response.headers.get("content-type"),
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
