import { it } from "vitest";
import {
  formatReleaseParsedSummary,
  formatReleaseSourceSummary,
  getReleaseFlags,
  releaseFlagBadgeClass,
} from "./metadata";

it("release metadata helpers format shared source and parsed summaries", () => {
  const sourceSummary = formatReleaseSourceSummary({
    group: "SubsPlease",
    indexer: "Nyaa",
    quality: "WEB-DL 1080p",
    resolution: "1080p",
  });
  const parsedSummary = formatReleaseParsedSummary({
    parsed_air_date: "2025-03-14",
    parsed_episode_label: "S01E01",
  });

  if (sourceSummary !== "SubsPlease • Nyaa • WEB-DL 1080p") {
    throw new Error(`Unexpected source summary: ${sourceSummary}`);
  }

  if (parsedSummary !== "S01E01 • 2025-03-14") {
    throw new Error(`Unexpected parsed summary: ${parsedSummary}`);
  }
});

it("release metadata helpers expose consistent flag order and styles", () => {
  const flags = getReleaseFlags({
    is_seadex_best: true,
    remake: true,
    seadex_dual_audio: true,
    trusted: true,
  });

  const labels = flags.map((flag) => flag.label);
  const expected = ["Trusted", "SeaDex Best", "Dual Audio", "Remake"];

  if (JSON.stringify(labels) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected release flags: ${JSON.stringify(labels)}`);
  }

  if (!releaseFlagBadgeClass("trusted").includes("text-success")) {
    throw new Error("Expected trusted badge class to use success tone");
  }
});
