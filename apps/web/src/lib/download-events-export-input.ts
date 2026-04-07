import type { DownloadEventsExportInput } from "~/lib/api";

export interface DownloadEventsExportFields {
  animeId: string;
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

function parseOptionalPositiveInt(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildDownloadEventsExportInput(
  fields: DownloadEventsExportFields,
  options?: {
    limit?: number | undefined;
    order?: "asc" | "desc" | undefined;
  },
): DownloadEventsExportInput {
  const animeId = parseOptionalPositiveInt(fields.animeId);
  const downloadId = parseOptionalPositiveInt(fields.downloadId);
  const endDate = fields.endDate || undefined;
  const eventType = fields.eventType === "all" ? undefined : fields.eventType;
  const startDate = fields.startDate || undefined;
  const status = fields.status || undefined;

  return {
    ...(animeId === undefined ? {} : { animeId }),
    ...(downloadId === undefined ? {} : { downloadId }),
    ...(endDate === undefined ? {} : { endDate }),
    ...(eventType === undefined ? {} : { eventType }),
    limit: options?.limit ?? 10_000,
    order: options?.order ?? "desc",
    ...(startDate === undefined ? {} : { startDate }),
    ...(status === undefined ? {} : { status }),
  };
}
