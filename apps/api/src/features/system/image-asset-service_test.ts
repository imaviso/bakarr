import { symlink } from "node:fs/promises";

import { Cause, Effect, Layer } from "effect";

import { AuthError } from "../auth/service.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { makeTestConfig } from "../../test/config-fixture.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "../../test/filesystem-test.ts";
import { assertEquals, assertInstanceOf, it } from "../../test/vitest.ts";
import {
  SystemConfigService,
  type SystemConfigServiceShape,
} from "./system-config-service.ts";
import { ImageAssetService, ImageAssetServiceLive } from "./image-asset-service.ts";

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

      assertEquals(new TextDecoder().decode(result.bytes), "png-data");
      assertEquals(result.filePath, imagePath);
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

      assertEquals(exit._tag, "Failure");

      if (exit._tag === "Failure") {
        const failure = Cause.failureOption(exit.cause);
        assertEquals(failure._tag, "Some");

        if (failure._tag === "Some") {
          assertInstanceOf(failure.value, AuthError);
          assertEquals(failure.value.status, 404);
          assertEquals(failure.value.message, "Not Found");
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
    updateConfig: () => Effect.die("unused in image asset service tests"),
  };
}
