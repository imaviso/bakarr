import { it } from "vitest";
import { brandQualityId } from "@bakarr/shared";
import {
  actionReasonFromDownloadAction,
  buildGrabInputFromEpisodeResult,
  buildGrabInputFromNyaaResult,
} from "./grab";

it("buildGrabInputFromNyaaResult maps fields consistently", () => {
  const payload = buildGrabInputFromNyaaResult({
    mediaId: 55,
    unitNumber: 3,
    isBatch: false,
    result: {
      indexer: "Nyaa",
      info_hash: "hash123",
      is_seadex: false,
      is_seadex_best: false,
      leechers: 2,
      magnet: "magnet:?xt=urn:btih:hash123",
      parsed_air_date: "2025-03-10",
      parsed_unit_label: "03",
      parsed_unit_numbers: [3],
      parsed_group: "SubsPlease",
      parsed_quality: "WEB-DL",
      parsed_resolution: "1080p",
      pub_date: "2025-03-10T00:00:00.000Z",
      remake: false,
      seeders: 20,
      size: "1.4 GiB",
      title: "[SubsPlease] Show - 03 (1080p)",
      trusted: true,
      view_url: "https://example.test/view/3",
    },
  });

  if (
    payload.media_id !== 55 ||
    payload.unit_number !== 3 ||
    payload.release_context?.info_hash !== "hash123"
  ) {
    throw new Error(`Unexpected Nyaa payload mapping: ${JSON.stringify(payload)}`);
  }
});

it("buildGrabInputFromEpisodeResult includes selected metadata", () => {
  const payload = buildGrabInputFromEpisodeResult({
    mediaId: 88,
    unitNumber: 7,
    result: {
      download_action: {
        Accept: {
          is_seadex: true,
          quality: {
            id: brandQualityId(2),
            name: "1080p",
            rank: 20,
            resolution: 1080,
            source: "web",
          },
          score: 12,
        },
      },
      group: "SubsPlease",
      indexer: "Nyaa",
      info_hash: "hash-episode",
      is_seadex: true,
      is_seadex_best: false,
      leechers: 2,
      link: "magnet:?xt=urn:btih:hash-episode",
      parsed_unit_label: "07",
      parsed_unit_numbers: [7],
      parsed_resolution: "1080p",
      publish_date: "2025-03-12T00:00:00.000Z",
      quality: "WEB-DL",
      remake: false,
      seeders: 19,
      size: 734003200,
      title: "MediaUnit title",
      trusted: true,
      view_url: "https://example.test/episode/7",
    },
  });

  if (
    payload.media_id !== 88 ||
    payload.unit_number !== 7 ||
    payload.release_context?.info_hash !== "hash-episode"
  ) {
    throw new Error(`Unexpected episode payload mapping: ${JSON.stringify(payload)}`);
  }
});

it("actionReasonFromDownloadAction returns upgrade and reject reasons", () => {
  const upgradeReason = actionReasonFromDownloadAction({
    Upgrade: {
      is_seadex: false,
      old_quality: {
        id: brandQualityId(1),
        name: "720p",
        rank: 10,
        resolution: 720,
        source: "web",
      },
      old_score: 2,
      quality: { id: brandQualityId(2), name: "1080p", rank: 20, resolution: 1080, source: "web" },
      reason: "better release",
      score: 7,
    },
  });
  const rejectReason = actionReasonFromDownloadAction({ Reject: { reason: "bad source" } });

  if (upgradeReason !== "better release" || rejectReason !== "bad source") {
    throw new Error(`Unexpected action reasons: ${upgradeReason} / ${rejectReason}`);
  }
});
