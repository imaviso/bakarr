import { it } from "~/test/vitest";
import { getDownloadStatusPresentation } from "./download-status";

it("getDownloadStatusPresentation maps known statuses", () => {
  const downloading = getDownloadStatusPresentation("downloading");
  if (
    downloading.icon !== "arrow-down" || downloading.label !== "Downloading"
  ) {
    throw new Error(
      `Unexpected downloading status: ${JSON.stringify(downloading)}`,
    );
  }

  const failed = getDownloadStatusPresentation("failed");
  if (failed.icon !== "alert" || failed.tone !== "destructive") {
    throw new Error(`Unexpected failed status: ${JSON.stringify(failed)}`);
  }
});

it("getDownloadStatusPresentation falls back for unknown statuses", () => {
  const unknown = getDownloadStatusPresentation("stalled");
  if (unknown.icon !== "clock" || unknown.label !== "Stalled") {
    throw new Error(
      `Unexpected unknown status presentation: ${JSON.stringify(unknown)}`,
    );
  }
});
