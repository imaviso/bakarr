import { it } from "~/test/vitest";
import { getReleaseConfidence } from "./release-selection";

it("getReleaseConfidence prefers SeaDex best over other hints", () => {
  const confidence = getReleaseConfidence({
    is_seadex: true,
    is_seadex_best: true,
    trusted: true,
  });

  if (
    confidence?.label !== "High confidence" ||
    confidence.reason !== "SeaDex Best release"
  ) {
    throw new Error(
      `Unexpected confidence metadata: ${JSON.stringify(confidence)}`,
    );
  }
});

it("getReleaseConfidence flags remakes for review", () => {
  const confidence = getReleaseConfidence({ remake: true, trusted: true });

  if (
    confidence?.label !== "Review" || confidence.reason !== "Marked as remake"
  ) {
    throw new Error(
      `Expected remake review metadata, got ${JSON.stringify(confidence)}`,
    );
  }
});
