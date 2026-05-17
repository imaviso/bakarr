import type { DownloadSourceMetadata, NotificationEvent } from "@bakarr/shared";
import {
  formatDownloadDecisionSummary,
  formatDownloadParsedMeta,
} from "~/domain/download/metadata";
import {
  buildReleaseSourceSummaryInput,
  formatReleaseSourceSummary,
} from "~/domain/release/metadata";

export function formatDownloadNotificationDescription(input: {
  imported_path?: string | undefined;
  covered_units?: number[] | undefined;
  is_batch?: boolean | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
}) {
  const releaseSummary = formatReleaseSourceSummary(
    buildReleaseSourceSummaryInput(input.source_metadata),
  );
  const parsedSummary = formatDownloadParsedMeta({
    source_metadata: input.source_metadata,
  });
  const decisionSummary = formatDownloadDecisionSummary({
    covered_units: input.covered_units,
    decision_reason: input.source_metadata?.decision_reason,
    is_batch: input.is_batch,
    source_metadata: input.source_metadata,
  });

  const parts = [
    releaseSummary,
    parsedSummary,
    decisionSummary,
    input.imported_path ? `Imported to ${input.imported_path}` : undefined,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

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
        description:
          event.payload.failed > 0
            ? `${event.payload.failed} failed while ${event.payload.imported} imported successfully`
            : undefined,
        message: `Import finished. Imported ${event.payload.imported}, Failed ${event.payload.failed}`,
      };
    default:
      return undefined;
  }
}
