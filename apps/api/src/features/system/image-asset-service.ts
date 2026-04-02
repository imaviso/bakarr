import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { FileSystem, isWithinPathRoot } from "@/lib/filesystem.ts";
import {
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  type StoredConfigCorruptError,
  type StoredConfigMissingError,
} from "@/features/system/errors.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";

export interface ImageAssetResult {
  readonly bytes: Uint8Array;
  readonly filePath: string;
}

export interface ImageAssetServiceShape {
  /**
   * Decode, canonicalize, authorize, and load an image asset by its raw
   * URL-encoded relative path under the configured images root.
   *
   * Fails with a 404 ImageAssetNotFoundError on any path-traversal,
   * unsupported extension, out-of-root access, or missing file.
   * Fails with a 413 ImageAssetTooLargeError when the file exceeds the
   * configured image asset size cap.
   */
  readonly resolveImageAsset: (
    rawRelativePath: string,
  ) => Effect.Effect<
    ImageAssetResult,
    | ImageAssetAccessError
    | DatabaseError
    | ImageAssetNotFoundError
    | ImageAssetTooLargeError
    | StoredConfigCorruptError
    | StoredConfigMissingError
  >;
}

export class ImageAssetService extends Context.Tag("@bakarr/api/ImageAssetService")<
  ImageAssetService,
  ImageAssetServiceShape
>() {}

const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"] as const;
const MAX_IMAGE_ASSET_BYTES = 8 * 1024 * 1024;

function isSupportedImageExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const notFoundError = () => new ImageAssetNotFoundError({ message: "Not Found", status: 404 });

const tooLargeError = () =>
  new ImageAssetTooLargeError({
    message: "Image asset payload exceeded the allowed size",
    status: 413,
  });

const accessError = (message: string, cause?: unknown) =>
  new ImageAssetAccessError({ cause, message, status: 500 });

function hasFileSystemErrorCode(cause: unknown, codes: readonly string[]) {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string" &&
    codes.includes(cause.code)
  );
}

function mapAssetPathError(error: { readonly cause?: unknown }, message: string) {
  if (hasFileSystemErrorCode(error.cause, ["ENOENT", "ENOTDIR"])) {
    return notFoundError();
  }

  return accessError(message, error.cause);
}

const makeImageAssetService = Effect.gen(function* () {
  const systemService = yield* SystemConfigService;
  const fs = yield* FileSystem;

  const resolveImageAsset = Effect.fn("ImageAssetService.resolveImageAsset")(function* (
    rawRelativePath: string,
  ) {
    const decodedRelativePath = yield* Effect.try(() => decodeURIComponent(rawRelativePath)).pipe(
      Effect.mapError(() => notFoundError()),
    );

    const segments = decodedRelativePath.split("/").filter((segment) => segment.length > 0);

    if (
      segments.length === 0 ||
      segments.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))
    ) {
      return yield* notFoundError();
    }

    const config = yield* systemService.getConfig();

    const imagesRoot = yield* fs
      .realPath(config.general.images_path.replace(/\/$/, ""))
      .pipe(
        Effect.mapError((error) =>
          accessError("Configured image directory could not be resolved", error.cause),
        ),
      );
    const filePath = `${imagesRoot}/${segments.join("/")}`;
    const canonicalFilePath = yield* fs
      .realPath(filePath)
      .pipe(
        Effect.mapError((error) =>
          mapAssetPathError(error, "Image asset path could not be resolved"),
        ),
      );

    if (
      !isWithinPathRoot(canonicalFilePath, imagesRoot) ||
      !isSupportedImageExtension(canonicalFilePath)
    ) {
      return yield* notFoundError();
    }

    const bytes = yield* fs
      .stat(canonicalFilePath)
      .pipe(
        Effect.mapError((error) =>
          mapAssetPathError(error, "Image asset metadata could not be read"),
        ),
      );

    if (bytes.size > MAX_IMAGE_ASSET_BYTES) {
      return yield* tooLargeError();
    }

    const fileBytes = yield* fs
      .readFile(canonicalFilePath)
      .pipe(
        Effect.mapError((error) => mapAssetPathError(error, "Image asset bytes could not be read")),
      );

    return { bytes: fileBytes, filePath: canonicalFilePath } satisfies ImageAssetResult;
  });

  return { resolveImageAsset } satisfies ImageAssetServiceShape;
});

export const ImageAssetServiceLive = Layer.effect(ImageAssetService, makeImageAssetService);
