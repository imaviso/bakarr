import { assert, it } from "@effect/vitest";

import {
  extractAudioChannels,
  extractAudioCodec,
  extractEpisodeTitleFromPath,
  extractQualitySourceLabel,
  extractVideoCodec,
  normalizeAirDate,
  normalizeText,
} from "@/infra/scanned-file-metadata.ts";

it("extractQualitySourceLabel detects common quality sources", () => {
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [BluRay 1080p]"), "BluRay");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [BDRip 1080p]"), "BluRay");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [BDMV 2160p]"), "BluRay");
  assert.deepStrictEqual(
    extractQualitySourceLabel("[Group] Show - 01 [Remux 1080p]"),
    "BluRay Remux",
  );
  assert.deepStrictEqual(
    extractQualitySourceLabel("[Group] Show - 01 [BDRemux 1080p]"),
    "BluRay Remux",
  );
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [WEB-DL 1080p]"), "WEB-DL");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [WEBDL 1080p]"), "WEB-DL");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [AMZN 1080p]"), "WEB-DL");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [NF 1080p]"), "WEB-DL");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [CR 1080p]"), "WEB-DL");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [DSNP 1080p]"), "WEB-DL");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [HMAX 1080p]"), "WEB-DL");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [WEBRip 1080p]"), "WEBRip");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [HDTV 1080p]"), "HDTV");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [DVD 480p]"), "DVD");
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [SDTV 480p]"), "SDTV");
});

it("extractQualitySourceLabel detects bare WEB tag", () => {
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [WEB 1080p]"), "WEB");
  assert.deepStrictEqual(extractQualitySourceLabel("Show - 01 WEB 1080p"), "WEB");
});

it("extractQualitySourceLabel detects bare BD tag", () => {
  assert.deepStrictEqual(extractQualitySourceLabel("Show BD 1080p"), "BluRay");
});

it("extractQualitySourceLabel returns undefined for unknown source", () => {
  assert.deepStrictEqual(extractQualitySourceLabel("[Group] Show - 01 [1080p]"), undefined);
  assert.deepStrictEqual(extractQualitySourceLabel("Show.mp4"), undefined);
});

it("extractVideoCodec detects common video codecs", () => {
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [x265]"), "x265");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [HEVC]"), "HEVC");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [H.265]"), "H.265");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [x264]"), "x264");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [AVC]"), "AVC");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [H.264]"), "H.264");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [H 265]"), "H.265");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [AV1]"), "AV1");
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [VP9]"), "VP9");
});

it("extractVideoCodec returns undefined when no codec found", () => {
  assert.deepStrictEqual(extractVideoCodec("[Group] Show - 01 [1080p]"), undefined);
});

it("extractAudioCodec detects common audio codecs", () => {
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [AAC]"), "AAC");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [FLAC]"), "FLAC");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [Opus]"), "Opus");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [AC3]"), "AC3");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [EAC3]"), "EAC3");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [DDP]"), "DDP");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [TrueHD]"), "TrueHD");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [DTS]"), "DTS");
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [DTS-HD]"), "DTS-HD");
});

it("extractAudioCodec returns undefined when no codec found", () => {
  assert.deepStrictEqual(extractAudioCodec("[Group] Show - 01 [1080p]"), undefined);
});

it("extractAudioChannels detects standard channel counts", () => {
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [AAC 2.0]"), "2.0");
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [FLAC 5.1]"), "5.1");
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [TrueHD 7.1]"), "7.1");
});

it("extractAudioChannels detects 'ch' suffix notation", () => {
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [AAC 2ch]"), "2.0");
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [FLAC 6ch]"), "5.1");
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [Opus 8ch]"), "7.1");
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [AAC 1ch]"), "1.0");
});

it("extractAudioChannels returns undefined when no channel info", () => {
  assert.deepStrictEqual(extractAudioChannels("[Group] Show - 01 [1080p]"), undefined);
});

it("extractEpisodeTitleFromPath strips extension and label prefix", () => {
  const result = extractEpisodeTitleFromPath({
    filePath: "/downloads/[Group] Show - 01 - MediaUnit Title [1080p].mkv",
    sourceIdentity: {
      unit_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
  });
  assert.deepStrictEqual(result, "MediaUnit Title");
});

it("extractEpisodeTitleFromPath strips metadata tags from end of title", () => {
  const result = extractEpisodeTitleFromPath({
    filePath: "/downloads/[Group] Show - 01 - MediaUnit Title [1080p] [HEVC] [AAC].mkv",
    sourceIdentity: {
      unit_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
  });
  assert.deepStrictEqual(result, "MediaUnit Title");
});

it("extractEpisodeTitleFromPath strips group name suffix", () => {
  const result = extractEpisodeTitleFromPath({
    filePath: "/downloads/[SubsPlease] Show - 01 - MediaUnit Title [1080p] [SubsPlease].mkv",
    group: "SubsPlease",
    sourceIdentity: {
      unit_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
  });
  assert.deepStrictEqual(result, "MediaUnit Title");
});

it("extractEpisodeTitleFromPath returns undefined when no source identity", () => {
  const result = extractEpisodeTitleFromPath({
    filePath: "/downloads/Show - 01.mkv",
  });
  assert.deepStrictEqual(result, undefined);
});

it("extractEpisodeTitleFromPath returns undefined when label not found", () => {
  const result = extractEpisodeTitleFromPath({
    filePath: "/downloads/Show - MediaUnit Title [1080p].mkv",
    sourceIdentity: {
      unit_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
  });
  assert.deepStrictEqual(result, undefined);
});

it("normalizeText returns trimmed non-empty strings", () => {
  assert.deepStrictEqual(normalizeText("  hello  "), "hello");
  assert.deepStrictEqual(normalizeText(""), undefined);
  assert.deepStrictEqual(normalizeText(null), undefined);
  assert.deepStrictEqual(normalizeText(undefined), undefined);
  assert.deepStrictEqual(normalizeText("   "), undefined);
});

it("normalizeAirDate extracts YYYY-MM-DD prefix or returns trimmed", () => {
  assert.deepStrictEqual(normalizeAirDate("2025-03-14T12:00:00Z"), "2025-03-14");
  assert.deepStrictEqual(normalizeAirDate("2025-03-14"), "2025-03-14");
  assert.deepStrictEqual(normalizeAirDate(null), undefined);
  assert.deepStrictEqual(normalizeAirDate("not-a-date"), "not-a-date");
});
