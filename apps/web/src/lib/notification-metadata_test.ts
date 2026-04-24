import { it } from "vitest";
import {
  formatDownloadNotificationDescription,
  getNotificationToastCopy,
} from "./notification-metadata";

it("notification metadata formats rich download descriptions", () => {
  const description = formatDownloadNotificationDescription({
    imported_path: "/library/Show/Show - 01.mkv",
    source_metadata: {
      air_date: "2025-03-14",
      decision_reason: "Manual grab from release search",
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
  });

  if (!description?.includes("SubsPlease • Nyaa • WEB-DL 1080p")) {
    throw new Error(`Missing release summary: ${description}`);
  }

  if (!description.includes("01 • 2025-03-14")) {
    throw new Error(`Missing parsed summary: ${description}`);
  }

  if (!description.includes("Manual grab from release search")) {
    throw new Error(`Missing decision summary: ${description}`);
  }

  if (!description.includes("Imported to /library/Show/Show - 01.mkv")) {
    throw new Error(`Missing import path: ${description}`);
  }
});

it("notification metadata exposes toast copy for download events", () => {
  const copy = getNotificationToastCopy({
    payload: {
      anime_id: 20,
      source_metadata: {
        group: "SubsPlease",
        indexer: "Nyaa",
        quality: "WEB-DL 1080p",
      },
      title: "[SubsPlease] Show - 01 (1080p)",
    },
    type: "DownloadStarted",
  });

  if (copy?.message !== "Download started: [SubsPlease] Show - 01 (1080p)") {
    throw new Error(`Unexpected toast message: ${copy?.message}`);
  }

  if (!copy.description?.includes("SubsPlease • Nyaa • WEB-DL 1080p")) {
    throw new Error(`Unexpected toast description: ${copy.description}`);
  }
});
