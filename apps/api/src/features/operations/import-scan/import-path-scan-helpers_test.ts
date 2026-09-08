import { Effect, Layer } from "effect";
import { assert, it } from "@effect/vitest";
import { brandMediaId } from "@packages/shared/index.ts";

import {
  buildUnitFileMappingIndex,
  buildScannedFileLibrarySignals,
  buildScannedFileNamingPlan,
  DEFAULT_IMPORT_SCAN_LIMIT,
  MAX_IMPORT_SCAN_LIMIT,
  resolveImportScanLimit,
} from "@/features/operations/import-scan/import-path-scan-helpers.ts";
import { LibraryNaming, makeLibraryNaming } from "@/features/operations/library/library-naming.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe, MediaProbeNoMetadata } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";

function makeNamingShapeEffect(fs: FileSystem["Service"]) {
  const layer = Layer.effect(LibraryNaming, makeLibraryNaming()).pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(FileSystem, FileSystem.of(fs)),
        Layer.succeed(
          MediaProbe,
          MediaProbe.of({
            probeVideoFile: (_path: string) => Effect.succeed(new MediaProbeNoMetadata()),
          }),
        ),
        Layer.succeed(
          RandomService,
          RandomService.of({
            randomBytes: () => Effect.sync(() => new Uint8Array(16)),
            randomUuid: Effect.succeed("test-uuid"),
          }),
        ),
      ),
    ),
  );
  return LibraryNaming.pipe(Effect.provide(layer));
}

it("resolveImportScanLimit defaults missing values and clamps bounds", () => {
  assert.deepStrictEqual(resolveImportScanLimit(undefined), DEFAULT_IMPORT_SCAN_LIMIT);
  assert.deepStrictEqual(resolveImportScanLimit(0), 1);
  assert.deepStrictEqual(resolveImportScanLimit(-100), 1);
  assert.deepStrictEqual(resolveImportScanLimit(42), 42);
  assert.deepStrictEqual(resolveImportScanLimit(MAX_IMPORT_SCAN_LIMIT + 1), MAX_IMPORT_SCAN_LIMIT);
});

it("buildScannedFileLibrarySignals reports existing exact-path mappings", () => {
  const mappingIndex = buildUnitFileMappingIndex([
    {
      media_id: 20,
      media_title: "Naruto",
      unit_number: 1,
      file_path: "/imports/Naruto - 01.mkv",
    },
    {
      media_id: 20,
      media_title: "Naruto",
      unit_number: 2,
      file_path: "/imports/Naruto - 01.mkv",
    },
  ]);

  assert.deepStrictEqual(
    buildScannedFileLibrarySignals({
      file: {
        unit_number: 1,
        unit_numbers: [1, 2],
        source_path: "/imports/Naruto - 01.mkv",
      },
      mappingIndex,
      targetAnime: { id: brandMediaId(20), title: "Naruto" },
    }),
    {
      existing_mapping: {
        media_id: brandMediaId(20),
        media_title: "Naruto",
        unit_numbers: [1, 2],
        file_path: "/imports/Naruto - 01.mkv",
      },
    },
  );
});

it("buildScannedFileLibrarySignals reports duplicate episode conflicts", () => {
  const mappingIndex = buildUnitFileMappingIndex([
    {
      media_id: 20,
      media_title: "Naruto",
      unit_number: 1,
      file_path: "/library/Naruto/Naruto - 01.mkv",
    },
    {
      media_id: 20,
      media_title: "Naruto",
      unit_number: 2,
      file_path: "/library/Naruto/Naruto - 02.mkv",
    },
  ]);

  assert.deepStrictEqual(
    buildScannedFileLibrarySignals({
      file: {
        unit_number: 1,
        unit_numbers: [1, 2],
        source_path: "/imports/Naruto batch.mkv",
      },
      mappingIndex,
      targetAnime: { id: brandMediaId(20), title: "Naruto" },
    }),
    {
      unit_conflict: {
        media_id: brandMediaId(20),
        media_title: "Naruto",
        unit_numbers: [1, 2],
        file_path: "/library/Naruto/Naruto - 01.mkv",
      },
      existing_mapping: undefined,
    },
  );
});

it.effect("buildScannedFileNamingPlan exposes naming details for matched media files", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const rootFolder = `${root}/library/Naruto`;
      yield* fs.mkdir(rootFolder, { recursive: true });
      const result = yield* buildScannedFileNamingPlan({
        animeRow: {
          format: "TV",
          rootFolder,
          startDate: "2024-01-01",
          startYear: 2024,
          titleRomaji: "Naruto",
        },
        episodeRows: [{ aired: "2024-01-01", title: "Enter Naruto Uzumaki!" }],
        file: {
          audio_channels: "2.0",
          audio_codec: "AAC",
          unit_number: 1,
          group: "SubsPlease",
          quality: "WEB-DL",
          resolution: "1080p",
          season: 1,
          source_path: "/imports/Naruto - S01E01.mkv",
          source_identity: {
            unit_numbers: [1],
            label: "S01E01",
            scheme: "season",
            season: 1,
          },
          video_codec: "HEVC",
        },
        naming: yield* makeNamingShapeEffect(fs),
        namingSettings: {
          movieNamingFormat: "{title} ({year})",
          namingFormat: "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
          preferredTitle: "romaji",
        },
      });

      assert.deepStrictEqual(result.naming_fallback_used, undefined);
      assert.deepStrictEqual(result.naming_filename, "Naruto - S01E01 [WEB-DL 1080p].mkv");
      assert.deepStrictEqual(
        result.naming_format_used,
        "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
      );
      assert.deepStrictEqual(result.naming_metadata_snapshot?.unit_title, "Enter Naruto Uzumaki!");
      assert.deepStrictEqual(result.naming_metadata_snapshot?.title_source, "preferred_romaji");
    }),
  ),
);

it.effect(
  "buildScannedFileNamingPlan avoids duplicate resolution when quality already includes it",
  () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const rootFolder = `${root}/library/Jigokuraku`;
        yield* fs.mkdir(rootFolder, { recursive: true });
        const result = yield* buildScannedFileNamingPlan({
          animeRow: {
            format: "TV",
            rootFolder,
            startDate: "2023-04-01",
            startYear: 2023,
            titleRomaji: "Jigokuraku",
          },
          episodeRows: [{ aired: "2023-04-01", title: "Hell and Paradise" }],
          file: {
            audio_channels: "2.0",
            audio_codec: "Opus",
            unit_number: 1,
            group: "Vodes",
            quality: "WEB-DL 1080p",
            resolution: "1080p",
            season: 1,
            source_path: "/imports/Jigokuraku - S01E01 v2 (BD 1080p HEVC) [Vodes].mkv",
            source_identity: {
              unit_numbers: [1],
              label: "S01E01",
              scheme: "season",
              season: 1,
            },
            video_codec: "HEVC",
          },
          naming: yield* makeNamingShapeEffect(fs),
          namingSettings: {
            movieNamingFormat: "{title} ({year})",
            namingFormat: "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
            preferredTitle: "romaji",
          },
        });

        assert.deepStrictEqual(result.naming_filename, "Jigokuraku - S01E01 [WEB-DL 1080p].mkv");
      }),
    ),
);

it.effect("buildScannedFileNamingPlan keeps extension logic within file basename", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const rootFolder = `${root}/library/Test`;
      yield* fs.mkdir(rootFolder, { recursive: true });
      const result = yield* buildScannedFileNamingPlan({
        animeRow: {
          format: "TV",
          rootFolder,
          startDate: "2024-01-01",
          startYear: 2024,
          titleRomaji: "Test",
        },
        episodeRows: [{ aired: "2024-01-01", title: "MediaUnit" }],
        file: {
          audio_channels: "2.0",
          audio_codec: "AAC",
          unit_number: 1,
          group: "Group",
          quality: "WEB-DL",
          resolution: "1080p",
          season: 1,
          source_path: "/imports.v2/Test - S01E01",
          source_identity: {
            unit_numbers: [1],
            label: "S01E01",
            scheme: "season",
            season: 1,
          },
          video_codec: "HEVC",
        },
        naming: yield* makeNamingShapeEffect(fs),
        namingSettings: {
          movieNamingFormat: "{title} ({year})",
          namingFormat: "{title} - S{season:02}E{episode:02}",
          preferredTitle: "romaji",
        },
      });

      assert.deepStrictEqual(result.naming_filename, "Test - S01E01.mkv");
    }),
  ),
);
