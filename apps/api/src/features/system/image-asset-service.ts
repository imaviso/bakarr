import { Context, Effect, Layer } from "effect";

import { AuthError } from "../auth/service.ts";
import { FileSystem, isWithinPathRoot } from "../../lib/filesystem.ts";
import { SystemConfigService } from "./system-config-service.ts";

export interface ImageAssetResult {
  readonly bytes: Uint8Array;
  readonly filePath: string;
}

export interface ImageAssetServiceShape {
  /**
   * Decode, canonicalize, authorize, and load an image asset by its raw
   * URL-encoded relative path under the configured images root.
   *
   * Fails with a 404 AuthError on any path-traversal, unsupported extension,
   * out-of-root access, or missing file.
   */
  readonly resolveImageAsset: (
    rawRelativePath: string,
  ) => Effect.Effect<ImageAssetResult, AuthError>;
}

export class ImageAssetService extends Context.Tag("@bakarr/api/ImageAssetService")<
  ImageAssetService,
  ImageAssetServiceShape
>() {}

const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"] as const;

function isSupportedImageExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const notFoundError = () => new AuthError({ message: "Not Found", status: 404 });

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

    const config = yield* systemService.getConfig().pipe(Effect.mapError(() => notFoundError()));

    const imagesRoot = yield* fs
      .realPath(config.general.images_path.replace(/\/$/, ""))
      .pipe(Effect.mapError(() => notFoundError()));
    const filePath = `${imagesRoot}/${segments.join("/")}`;
    const canonicalFilePath = yield* fs.realPath(filePath).pipe(Effect.mapError(() => notFoundError()));

    if (!isWithinPathRoot(canonicalFilePath, imagesRoot) || !isSupportedImageExtension(canonicalFilePath)) {
      return yield* notFoundError();
    }

    const bytes = yield* fs.readFile(canonicalFilePath).pipe(Effect.mapError(() => notFoundError()));

    return { bytes, filePath: canonicalFilePath } satisfies ImageAssetResult;
  });

  return { resolveImageAsset } satisfies ImageAssetServiceShape;
});

export const ImageAssetServiceLive = Layer.effect(ImageAssetService, makeImageAssetService);
