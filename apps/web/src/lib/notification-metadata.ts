import type { DownloadSourceMetadata, NotificationEvent } from "@bakarr/shared";
import {
  formatDownloadDecisionSummary,
  formatDownloadParsedMeta,
} from "~/lib/download-metadata";
import { formatReleaseSourceSummary } from "~/lib/release-metadata";

export function formatDownloadNotificationDescription(input: {
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}) {
  const releaseSummary = formatReleaseSourceSummary({
    group: input.source_metadata?.group,
    indexer: input.source_metadata?.indexer,
    quality: input.source_metadata?.quality,
    resolution: input.source_metadata?.resolution,
  });
  const parsedSummary = formatDownloadParsedMeta({
    source_metadata: input.source_metadata,
  });
  const decisionSummary = formatDownloadDecisionSummary({
    decision_reason: input.source_metadata?.decision_reason,
    source_metadata: input.source_metadata,
  });

  const parts = [
    releaseSummary,
    parsedSummary,
    decisionSummary,
    input.imported_path ? `Imported to ${input.imported_path}` : undefined,
  ].filter((value): value is string =>
    typeof value === "string" && value.length > 0
  );

  return parts.length > 0 ? parts.join("\n") : undefined;
}

export function getNotificationToastCopy(event: NotificationEvent) {
  switch (event.type) {
    case "DownloadStarted":
      return {
        description: formatDownloadNotificationDescription(event.payload),
        message: `Download started: ${event.payload.title}`,
      };
    case "DownloadFinished":
      return {
        description: formatDownloadNotificationDescription(event.payload),
        message: `Download finished: ${event.payload.title}`,
      };
    case "ImportFinished":
      return {
        description: event.payload.failed > 0
          ? `${event.payload.failed} failed while ${event.payload.imported} imported successfully`
          : undefined,
        message:
          `Import finished. Imported ${event.payload.imported}, Failed ${event.payload.failed}`,
      };
    default:
      return undefined;
  }
}
