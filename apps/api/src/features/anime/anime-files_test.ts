import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { collectVideoFiles } from "@/features/anime/files.ts";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";

it.scoped("collectVideoFiles discovers video files recursively", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const animeRoot = `${root}/anime`;
      yield* fs.mkdir(animeRoot, { recursive: true });
      yield* fs.mkdir(`${animeRoot}/Season 1`, { recursive: true });
      yield* writeTextFile(fs, `${animeRoot}/Show - 01.mkv`, "video");
      yield* writeTextFile(fs, `${animeRoot}/Show - 02.mkv`, "video");
      yield* writeTextFile(fs, `${animeRoot}/Season 1/Show - 03.mkv`, "video");

      const files = yield* collectVideoFiles(fs, animeRoot);

      assert.deepStrictEqual(files.length, 3);
      assert.ok(files.every((f) => f.name.endsWith(".mkv")));
    }),
  ),
);

it.scoped("collectVideoFiles ignores non-video files", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const animeRoot = `${root}/anime`;
      yield* fs.mkdir(animeRoot, { recursive: true });
      yield* writeTextFile(fs, `${animeRoot}/info.txt`, "text");
      yield* writeTextFile(fs, `${animeRoot}/cover.jpg`, "image");
      yield* writeTextFile(fs, `${animeRoot}/subs.srt`, "text");

      const files = yield* collectVideoFiles(fs, animeRoot);

      assert.deepStrictEqual(files.length, 0);
    }),
  ),
);

it.scoped("collectVideoFiles handles a mix of video types", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const animeRoot = `${root}/anime`;
      yield* fs.mkdir(animeRoot, { recursive: true });
      yield* writeTextFile(fs, `${animeRoot}/Show - 01.mkv`, "mkv");
      yield* writeTextFile(fs, `${animeRoot}/Show - 02.mp4`, "mp4");
      yield* writeTextFile(fs, `${animeRoot}/Show - 03.avi`, "avi");
      yield* writeTextFile(fs, `${animeRoot}/Show - 04.webm`, "webm");

      const files = yield* collectVideoFiles(fs, animeRoot);

      assert.deepStrictEqual(files.length, 4);
    }),
  ),
);

it.scoped("collectVideoFiles returns sorted by name", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const animeRoot = `${root}/anime`;
      yield* fs.mkdir(animeRoot, { recursive: true });
      yield* writeTextFile(fs, `${animeRoot}/Z - Last.mkv`, "video");
      yield* writeTextFile(fs, `${animeRoot}/A - First.mkv`, "video");
      yield* writeTextFile(fs, `${animeRoot}/M - Middle.mkv`, "video");

      const files = yield* collectVideoFiles(fs, animeRoot);

      assert.deepStrictEqual(files[0]?.name, "A - First.mkv");
      assert.deepStrictEqual(files[1]?.name, "M - Middle.mkv");
      assert.deepStrictEqual(files[2]?.name, "Z - Last.mkv");
    }),
  ),
);

it.scoped("collectVideoFiles handles missing root folder by failing", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(collectVideoFiles(fs, `${root}/nonexistent`));
      assert.deepStrictEqual(exit._tag, "Failure");
    }),
  ),
);
