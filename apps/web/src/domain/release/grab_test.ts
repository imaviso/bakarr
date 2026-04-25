import { it } from "vitest";
import {
  actionReasonFromDownloadAction,
  buildGrabInputFromEpisodeResult,
  buildGrabInputFromNyaaResult,
  decisionReasonFromEpisodeResult,
  decisionReasonFromNyaaResult,
  selectionMetadataFromNyaaResult,
} from "./grab";

it("decisionReasonFromNyaaResult returns SeaDex Best reason for trusted batches", () => {
  const reason = decisionReasonFromNyaaResult({
    coveredEpisodes: [1, 2],
    isBatch: true,
    isSeaDex: true,
    isSeaDexBest: true,
    trusted: true,
  });

  if (reason !== "Batch SeaDex Best release") {
    throw new Error(`Unexpected Nyaa decision reason: ${reason}`);
  }
});

it("selectionMetadataFromNyaaResult marks SeaDex releases as accept", () => {
  const selection = selectionMetadataFromNyaaResult({
    indexer: "Nyaa",
    info_hash: "hash",
    is_seadex: true,
    is_seadex_best: false,
    leechers: 1,
    magnet: "magnet:?xt=urn:btih:hash",
    pub_date: "2025-01-01T00:00:00.000Z",
    remake: false,
    seeders: 10,
    size: "1.0 GiB",
    title: "[Group] Show - 01",
    trusted: true,
    view_url: "https://example.test/view",
  });

  if (selection.selection_kind !== "accept" || selection.chosen_from_seadex !== true) {
    throw new Error(`Unexpected Nyaa selection metadata: ${JSON.stringify(selection)}`);
  }
});

it("buildGrabInputFromNyaaResult maps fields consistently", () => {
  const payload = buildGrabInputFromNyaaResult({
    animeId: 55,
    episodeNumber: 3,
    isBatch: false,
    result: {
      indexer: "Nyaa",
      info_hash: "hash123",
      is_seadex: false,
      is_seadex_best: false,
      leechers: 2,
      magnet: "magnet:?xt=urn:btih:hash123",
      parsed_air_date: "2025-03-10",
      parsed_episode_label: "03",
      parsed_episode_numbers: [3],
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
    payload.anime_id !== 55 ||
    payload.episode_number !== 3 ||
    payload.release_context?.info_hash !== "hash123"
  ) {
    throw new Error(`Unexpected Nyaa payload mapping: ${JSON.stringify(payload)}`);
  }
});

it("decisionReasonFromEpisodeResult prefers upgrade reason", () => {
  const reason = decisionReasonFromEpisodeResult({
    download_action: {
      Upgrade: {
        is_seadex: false,
        old_quality: { id: 1, name: "720p", rank: 10, resolution: 720, source: "web" },
        old_score: 5,
        quality: { id: 2, name: "1080p", rank: 20, resolution: 1080, source: "web" },
        reason: "higher score",
        score: 9,
      },
    },
    indexer: "Nyaa",
    info_hash: "hash-upgrade",
    leechers: 0,
    link: "magnet:?xt=urn:btih:hash-upgrade",
    publish_date: "2025-03-11T00:00:00.000Z",
    quality: "1080p",
    seeders: 7,
    size: 100,
    title: "Upgrade title",
  });

  if (reason !== "Upgrade: higher score") {
    throw new Error(`Unexpected episode decision reason: ${reason}`);
  }
});

it("buildGrabInputFromEpisodeResult includes selected metadata", () => {
  const payload = buildGrabInputFromEpisodeResult({
    animeId: 88,
    episodeNumber: 7,
    result: {
      download_action: {
        Accept: {
          is_seadex: true,
          quality: { id: 2, name: "1080p", rank: 20, resolution: 1080, source: "web" },
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
      parsed_episode_label: "07",
      parsed_episode_numbers: [7],
      parsed_resolution: "1080p",
      publish_date: "2025-03-12T00:00:00.000Z",
      quality: "WEB-DL",
      remake: false,
      seeders: 19,
      size: 734003200,
      title: "Episode title",
      trusted: true,
      view_url: "https://example.test/episode/7",
    },
  });

  if (
    payload.anime_id !== 88 ||
    payload.episode_number !== 7 ||
    payload.release_context?.info_hash !== "hash-episode"
  ) {
    throw new Error(`Unexpected episode payload mapping: ${JSON.stringify(payload)}`);
  }
});

it("actionReasonFromDownloadAction returns upgrade and reject reasons", () => {
  const upgradeReason = actionReasonFromDownloadAction({
    Upgrade: {
      is_seadex: false,
      old_quality: { id: 1, name: "720p", rank: 10, resolution: 720, source: "web" },
      old_score: 2,
      quality: { id: 2, name: "1080p", rank: 20, resolution: 1080, source: "web" },
      reason: "better release",
      score: 7,
    },
  });
  const rejectReason = actionReasonFromDownloadAction({ Reject: { reason: "bad source" } });

  if (upgradeReason !== "better release" || rejectReason !== "bad source") {
    throw new Error(`Unexpected action reasons: ${upgradeReason} / ${rejectReason}`);
  }
});
