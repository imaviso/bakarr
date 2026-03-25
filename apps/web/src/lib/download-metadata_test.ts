import { it } from "~/test/vitest";
import {
  formatCoverageMeta,
  formatDownloadDecisionBadge,
  formatDownloadDecisionSummary,
  formatDownloadParsedMeta,
  formatDownloadRankingMeta,
  formatDownloadReleaseMeta,
  formatEpisodeCoverage,
  getDownloadReleaseConfidence,
} from "./download-metadata";

it("download metadata helpers format coverage and release context", () => {
  if (formatEpisodeCoverage(1, undefined, true) !== "Batch pending") {
    throw new Error("Expected pending batch coverage label");
  }

  if (formatEpisodeCoverage(3, [3, 4], false) !== "Batch 03-04") {
    throw new Error("Expected batch episode coverage label");
  }

  if (formatCoverageMeta([3, 4], false) !== "2 episodes: 3, 4") {
    throw new Error("Expected coverage meta label");
  }

  if (
    formatDownloadReleaseMeta({
      group: "SubsPlease",
      indexer: "Nyaa",
      quality: "WEB-DL",
      resolution: "1080p",
    }) !== "SubsPlease • Nyaa • WEB-DL 1080p"
  ) {
    throw new Error("Expected combined release metadata label");
  }

  if (
    formatDownloadParsedMeta({
      source_metadata: {
        air_date: "2025-03-14",
        source_identity: {
          air_dates: ["2025-03-14"],
          label: "S01E01",
          scheme: "daily",
        },
      },
    }) !== "S01E01 • 2025-03-14"
  ) {
    throw new Error("Expected parsed source metadata label");
  }
});

it("download metadata helpers expose decision, ranking, and confidence", () => {
  const item = {
    decision_reason: "Upgrade to better encode",
    source_metadata: {
      is_seadex_best: true,
      previous_quality: "720p",
      selection_kind: "upgrade" as const,
      selection_score: 125,
    },
  };

  if (formatDownloadDecisionBadge(item) !== "SeaDex Best") {
    throw new Error("Expected SeaDex decision badge");
  }

  if (formatDownloadRankingMeta(item) !== "Upgrade • score 125 • from 720p") {
    throw new Error("Expected ranking summary");
  }

  if (
    formatDownloadDecisionSummary(item) !==
    "Upgrade • score 125 • from 720p • Upgrade to better encode"
  ) {
    throw new Error("Expected compact decision summary");
  }

  const confidence = getDownloadReleaseConfidence(item);
  if (confidence?.label !== "High confidence" || confidence.reason !== "SeaDex Best release") {
    throw new Error(`Unexpected download confidence: ${JSON.stringify(confidence)}`);
  }
});
