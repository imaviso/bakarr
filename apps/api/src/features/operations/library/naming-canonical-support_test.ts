import { assert, it } from "@effect/vitest";

import {
  buildCanonicalEpisodeNamingInput,
  buildEpisodeFilenamePlan,
} from "@/features/operations/library/naming-canonical-support.ts";

it("buildCanonicalEpisodeNamingInput prefers download metadata over path and probe metadata", () => {
  const result = buildCanonicalEpisodeNamingInput({
    animeStartDate: "2025-01-01",
    mediaTitle: "Show Name",
    downloadSourceMetadata: {
      audio_channels: "2.0",
      audio_codec: "AAC",
      group: "SourceGroup",
      quality: "WEB-DL",
      resolution: "720p",
      video_codec: "AV1",
    },
    unitNumbers: [1],
    filePath: "/downloads/Show Name - S01E01 [1080p][HEVC][FLAC][MTBB].mkv",
    localMediaMetadata: {
      audio_channels: "5.1",
      audio_codec: "OPUS",
      duration_seconds: 1440,
      resolution: "1080p",
      video_codec: "HEVC",
    },
  });

  assert.deepStrictEqual(result.namingInput.group, "SourceGroup");
  assert.deepStrictEqual(result.namingInput.quality, "WEB-DL");
  assert.deepStrictEqual(result.namingInput.resolution, "720p");
  assert.deepStrictEqual(result.namingInput.videoCodec, "AV1");
  assert.deepStrictEqual(result.namingInput.audioCodec, "AAC");
  assert.deepStrictEqual(result.namingInput.audioChannels, "2.0");
});

it("buildCanonicalEpisodeNamingInput uses single distinct episode row metadata", () => {
  const result = buildCanonicalEpisodeNamingInput({
    animeStartDate: "2025-01-01",
    mediaTitle: "Show Name",
    unitNumbers: [1, 2],
    episodeRows: [
      { aired: "2025-02-01T12:00:00.000Z", title: "Same Title" },
      { aired: "2025-02-01T00:00:00.000Z", title: "Same Title" },
    ],
    filePath: "/downloads/Show Name - 01-02.mkv",
  });

  assert.deepStrictEqual(result.namingInput.airDate, "2025-02-01");
  assert.deepStrictEqual(result.namingInput.unitTitle, "Same Title");
  assert.deepStrictEqual(result.warnings, []);
});

it("buildCanonicalEpisodeNamingInput warns and skips ambiguous multi-episode metadata", () => {
  const result = buildCanonicalEpisodeNamingInput({
    mediaTitle: "Show Name",
    unitNumbers: [1, 2],
    episodeRows: [
      { aired: "2025-02-01", title: "Part A" },
      { aired: "2025-02-08", title: "Part B" },
    ],
    filePath: "/downloads/Show Name - 01-02.mkv",
  });

  assert.deepStrictEqual(result.namingInput.airDate, undefined);
  assert.deepStrictEqual(result.namingInput.unitTitle, undefined);
  assert.deepStrictEqual(result.warnings, [
    "Skipped {unit_title} because the file covers multiple mediaUnits",
    "Skipped {air_date} because the file covers multiple mediaUnits",
  ]);
});

it("buildEpisodeFilenamePlan reports fallback details and metadata snapshot", () => {
  const plan = buildEpisodeFilenamePlan({
    animeRow: {
      format: "TV",
      startDate: "2025-01-01",
      startYear: 2025,
      titleEnglish: "English Show",
      titleNative: "Native Show",
      titleRomaji: "Romaji Show",
    },
    downloadSourceMetadata: {
      source_identity: {
        unit_numbers: [3],
        label: "S01E03",
        scheme: "season",
        season: 1,
      },
    },
    unitNumbers: [3],
    filePath: "/downloads/Romaji Show - S01E03.mkv",
    namingFormat: "{title} - S{season:02}E{episode:02}",
    preferredTitle: "english",
  });

  assert.deepStrictEqual(plan.baseName, "English Show - S01E03");
  assert.deepStrictEqual(plan.fallbackUsed, false);
  assert.deepStrictEqual(plan.metadataSnapshot.title, "English Show");
  assert.deepStrictEqual(plan.metadataSnapshot.title_source, "preferred_english");
  assert.deepStrictEqual(plan.metadataSnapshot.season, 1);
});
