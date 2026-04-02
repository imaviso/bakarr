import assert from "node:assert/strict";
import { symlink } from "node:fs/promises";

import { Cause, Effect, Layer } from "effect";

import { FileSystemError } from "@/lib/filesystem.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { it } from "@effect/vitest";
import {
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  StoredConfigCorruptError,
} from "@/features/system/errors.ts";
import {
  SystemConfigService,
  type SystemConfigServiceShape,
} from "@/features/system/system-config-service.ts";
import { ImageAssetService, ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";

it.scoped("resolveImageAsset reads files inside the configured image root", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const imagesRoot = `${root}/images`;
      const imagePath = `${imagesRoot}/cover.png`;

      yield* fs.mkdir(imagesRoot, { recursive: true });
      yield* writeTextFile(fs, imagePath, "png-data");

      const result = yield* ImageAssetService.pipe(
        Effect.flatMap((service) => service.resolveImageAsset("cover.png")),
        Effect.provide(makeImageAssetLayer(fs, imagesRoot)),
      );

      assert.deepStrictEqual(new TextDecoder().decode(result.bytes), "png-data");
      assert.deepStrictEqual(result.filePath, imagePath);
    }),
  ),
);

it.scoped("resolveImageAsset rejects symlink escapes outside the configured image root", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const imagesRoot = `${root}/images`;
      const outsidePath = `${root}/secret.png`;
      const symlinkPath = `${imagesRoot}/escape.png`;

      yield* fs.mkdir(imagesRoot, { recursive: true });
      yield* writeTextFile(fs, outsidePath, "secret-data");
      yield* Effect.tryPromise(() => symlink(outsidePath, symlinkPath));

      const exit = yield* ImageAssetService.pipe(
        Effect.flatMap((service) => service.resolveImageAsset("escape.png")),
        Effect.provide(makeImageAssetLayer(fs, imagesRoot)),
        Effect.exit,
      );

      assert.deepStrictEqual(exit._tag, "Failure");

      if (exit._tag === "Failure") {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");

        if (failure._tag === "Some") {
          assert.ok(failure.value instanceof ImageAssetNotFoundError);
          assert.deepStrictEqual(failure.value.status, 404);
          assert.deepStrictEqual(failure.value.message, "Not Found");
        }
      }
    }),
  ),
);

it.scoped("resolveImageAsset rejects oversized image files", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const imagesRoot = `${root}/images`;
      const imagePath = `${imagesRoot}/poster.jpg`;

      yield* fs.mkdir(imagesRoot, { recursive: true });
      yield* fs.writeFile(imagePath, new Uint8Array(8 * 1024 * 1024 + 1));

      const exit = yield* ImageAssetService.pipe(
        Effect.flatMap((service) => service.resolveImageAsset("poster.jpg")),
        Effect.provide(makeImageAssetLayer(fs, imagesRoot)),
        Effect.exit,
      );

      assert.deepStrictEqual(exit._tag, "Failure");

      if (exit._tag === "Failure") {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");

        if (failure._tag === "Some") {
          assert.ok(failure.value instanceof ImageAssetTooLargeError);
          assert.deepStrictEqual(failure.value.status, 413);
          assert.deepStrictEqual(
            failure.value.message,
            "Image asset payload exceeded the allowed size",
          );
        }
      }
    }),
  ),
);

it.scoped("resolveImageAsset preserves system config failures", () =>
  withFileSystemSandboxEffect(({ fs }) =>
    Effect.gen(function* () {
      const exit = yield* ImageAssetService.pipe(
        Effect.flatMap((service) => service.resolveImageAsset("cover.png")),
        Effect.provide(
          ImageAssetServiceLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(FileSystem, fs),
                Layer.succeed(SystemConfigService, {
                  getConfig: () =>
                    Effect.fail(
                      new StoredConfigCorruptError({ message: "stored configuration is corrupt" }),
                    ),
                } satisfies SystemConfigServiceShape),
              ),
            ),
          ),
        ),
        Effect.exit,
      );

      assert.deepStrictEqual(exit._tag, "Failure");

      if (exit._tag === "Failure") {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");

        if (failure._tag === "Some") {
          assert.ok(failure.value instanceof StoredConfigCorruptError);
          assert.deepStrictEqual(failure.value.message, "stored configuration is corrupt");
        }
      }
    }),
  ),
);

it.scoped("resolveImageAsset keeps filesystem access failures as infrastructure errors", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const imagesRoot = `${root}/images`;
      const imagePath = `${imagesRoot}/cover.png`;

      yield* fs.mkdir(imagesRoot, { recursive: true });
      yield* writeTextFile(fs, imagePath, "png-data");

      const failingFs = {
        ...fs,
        readFile: (_path: string | URL) =>
          Effect.fail(
            new FileSystemError({
              cause: { code: "EACCES" },
              message: "Failed to read file",
              path: imagePath,
            }),
          ),
      } satisfies typeof FileSystem.Service;

      const exit = yield* ImageAssetService.pipe(
        Effect.flatMap((service) => service.resolveImageAsset("cover.png")),
        Effect.provide(makeImageAssetLayer(failingFs, imagesRoot)),
        Effect.exit,
      );

      assert.deepStrictEqual(exit._tag, "Failure");

      if (exit._tag === "Failure") {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");

        if (failure._tag === "Some") {
          assert.ok(failure.value instanceof ImageAssetAccessError);
          assert.deepStrictEqual(failure.value.message, "Image asset bytes could not be read");
          assert.deepStrictEqual(failure.value.status, 500);
        }
      }
    }),
  ),
);

function makeImageAssetLayer(fs: typeof FileSystem.Service, imagesRoot: string) {
  return ImageAssetServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(FileSystem, fs),
        Layer.succeed(SystemConfigService, makeSystemConfigServiceStub(imagesRoot)),
      ),
    ),
  );
}

function makeSystemConfigServiceStub(imagesRoot: string): SystemConfigServiceShape {
  return {
    getConfig: () =>
      Effect.succeed(
        makeTestConfig(`${imagesRoot}/bakarr.sqlite`, (config) => ({
          ...config,
          general: {
            ...config.general,
            images_path: imagesRoot,
          },
        })),
      ),
  };
}
