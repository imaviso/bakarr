import { Effect, Layer } from "effect";
import { assert, describe, it } from "@effect/vitest";

import { DomainPathError } from "@/features/errors.ts";
import {
  LibraryNaming,
  makeLibraryNaming,
  type LibraryNamingRequest,
} from "@/features/operations/library/library-naming.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MAX_FILENAME_BYTES } from "@/infra/filesystem/path-policy.ts";
import { MediaProbe, MediaProbeNoMetadata } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";

function makeRequest(rootFolder: string, overrides: Partial<LibraryNamingRequest> = {}) {
  return {
    media: {
      titleRomaji: "Naruto",
      format: "TV",
      rootFolder,
    },
    unitNumbers: [1],
    sourcePath: `${rootFolder}/incoming/Naruto - 01.mkv`,
    namingFormat: "{title} - {unit}",
    preferredTitle: "romaji",
    ...overrides,
  } satisfies LibraryNamingRequest;
}

function makeNamingLayer(fs: FileSystem["Service"], probeCalls: { count: number }) {
  return Layer.effect(LibraryNaming, makeLibraryNaming()).pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(FileSystem, FileSystem.of(fs)),
        Layer.succeed(
          MediaProbe,
          MediaProbe.of({
            probeVideoFile: (_path: string) => {
              probeCalls.count += 1;
              return Effect.succeed(new MediaProbeNoMetadata());
            },
          }),
        ),
        Layer.succeed(
          RandomService,
          RandomService.of({
            randomBytes: () => Effect.sync(() => new Uint8Array(16)),
            randomUuid: Effect.succeed("test-uuid-0000-0000-0000-000000000000"),
          }),
        ),
      ),
    ),
  );
}

describe("LibraryNaming", () => {
  it.effect("preview equals placeFile destination", () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const animeRoot = `${root}/library/Naruto`;
        const sourceRoot = `${root}/incoming`;
        yield* fs.mkdir(animeRoot, { recursive: true });
        yield* fs.mkdir(sourceRoot, { recursive: true });
        const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;
        yield* writeTextFile(fs, sourcePath, "incoming");

        const probeCalls = { count: 0 };
        const layer = makeNamingLayer(fs, probeCalls);
        const request = makeRequest(animeRoot, { sourcePath });

        const run = Effect.gen(function* () {
          const naming = yield* LibraryNaming;
          const previewed = yield* naming.preview(request);
          const placed = yield* naming.placeFile(request, { importMode: "copy" });
          return { previewed, placed };
        }).pipe(Effect.provide(layer));

        const { previewed, placed } = yield* run;
        assert.strictEqual(placed.destination, previewed.destination);
        assert.strictEqual(placed.filename, previewed.filename);
      }),
    ),
  );

  it.effect("long title truncates to byte limit and stages without overflow", () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const animeRoot = `${root}/library/Long`;
        const sourceRoot = `${root}/incoming`;
        yield* fs.mkdir(animeRoot, { recursive: true });
        yield* fs.mkdir(sourceRoot, { recursive: true });
        const sourcePath = `${sourceRoot}/in.mkv`;
        yield* writeTextFile(fs, sourcePath, "incoming");

        const probeCalls = { count: 0 };
        const layer = makeNamingLayer(fs, probeCalls);
        const longTitle = `${"Ab".repeat(150)}-${"Cd".repeat(150)}`;
        const request = makeRequest(animeRoot, {
          media: { titleRomaji: longTitle, format: "TV", rootFolder: animeRoot },
          sourcePath,
        });

        const placed = yield* Effect.gen(function* () {
          const naming = yield* LibraryNaming;
          return yield* naming.placeFile(request, { importMode: "copy" });
        }).pipe(Effect.provide(layer));

        assert.isTrue(Buffer.byteLength(placed.filename, "utf8") <= MAX_FILENAME_BYTES);
      }),
    ),
  );

  it.effect("raw token slash escapes fail closed", () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const animeRoot = `${root}/library/Escape`;
        yield* fs.mkdir(animeRoot, { recursive: true });

        const probeCalls = { count: 0 };
        const layer = makeNamingLayer(fs, probeCalls);
        const request = makeRequest(animeRoot, {
          downloadSourceMetadata: { quality: "../../../../../../pwned" },
          namingFormat: "{title} {quality}",
          sourcePath: `${root}/incoming/in.mkv`,
        });

        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            const naming = yield* LibraryNaming;
            return yield* naming.preview(request);
          }).pipe(Effect.provide(layer)),
        );

        assert.strictEqual(exit._tag, "Failure");
        if (exit._tag === "Failure") {
          const error = exit.cause;
          assert.isTrue(error.toString().includes("DomainPathError"));
        }
      }),
    ),
  );

  it.effect("empty unit numbers fail with DomainPathError", () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const animeRoot = `${root}/library/Empty`;
        yield* fs.mkdir(animeRoot, { recursive: true });

        const probeCalls = { count: 0 };
        const layer = makeNamingLayer(fs, probeCalls);
        const request = makeRequest(animeRoot, {
          sourcePath: `${root}/incoming/in.mkv`,
          unitNumbers: [],
        });

        const error = yield* Effect.gen(function* () {
          const naming = yield* LibraryNaming;
          return yield* naming.preview(request);
        }).pipe(Effect.flip, Effect.provide(layer));

        assert.isTrue(error instanceof DomainPathError);
      }),
    ),
  );
});
