import { it } from "~/test/vitest";
import { getDownloadEventMetadataSummary } from "./download-event-metadata";

it("download event metadata summarizes coverage and provenance", () => {
  const summary = getDownloadEventMetadataSummary({
    metadata_json: {
      covered_episodes: [1, 2],
      imported_path: "/library/Naruto/Naruto - 01.mkv",
      source_metadata: {
        decision_reason: "Upgrade to better encode",
        group: "SubsPlease",
        indexer: "Nyaa",
        quality: "WEB-DL",
        resolution: "1080p",
        source_identity: {
          episode_numbers: [1],
          label: "01",
          scheme: "absolute",
        },
      },
    },
  });

  if (summary.coverage !== "Episodes 1, 2") {
    throw new Error(`Unexpected coverage: ${summary.coverage}`);
  }

  if (summary.source !== "SubsPlease • Nyaa • WEB-DL 1080p") {
    throw new Error(`Unexpected source summary: ${summary.source}`);
  }

  if (summary.parsed !== "01") {
    throw new Error(`Unexpected parsed summary: ${summary.parsed}`);
  }

  if (!summary.decision?.includes("Upgrade to better encode")) {
    throw new Error(`Unexpected decision summary: ${summary.decision}`);
  }

  if (summary.importedPath !== "/library/Naruto/Naruto - 01.mkv") {
    throw new Error(`Unexpected imported path: ${summary.importedPath}`);
  }
});
