import type { DownloadEventsExportInput, DownloadEventsFilterInput } from "~/api/contracts";

export interface DownloadEventsQueryFields {
  mediaId: string;
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

export interface DownloadEventsFilterFields extends DownloadEventsQueryFields {
  cursor: string;
  direction: "next" | "prev";
}

export function parseOptionalPositiveInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^[1-9]\d*$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeDownloadEventsQueryFields(input: DownloadEventsQueryFields) {
  return {
    mediaId: parseOptionalPositiveInt(input.mediaId),
    downloadId: parseOptionalPositiveInt(input.downloadId),
    endDate: parseOptionalText(input.endDate),
    eventType:
      parseOptionalText(input.eventType) === "all" ? undefined : parseOptionalText(input.eventType),
    startDate: parseOptionalText(input.startDate),
    status: parseOptionalText(input.status),
  };
}

export function buildDownloadEventsFilterInput(
  input: DownloadEventsFilterFields,
  options?: { limit?: number },
): DownloadEventsFilterInput {
  const base = normalizeDownloadEventsQueryFields(input);
  const cursor = parseOptionalText(input.cursor);

  return {
    direction: input.direction,
    ...(base.mediaId === undefined ? {} : { mediaId: base.mediaId }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(base.downloadId === undefined ? {} : { downloadId: base.downloadId }),
    ...(base.endDate === undefined ? {} : { endDate: base.endDate }),
    ...(base.eventType === undefined ? {} : { eventType: base.eventType }),
    limit: options?.limit ?? 24,
    ...(base.startDate === undefined ? {} : { startDate: base.startDate }),
    ...(base.status === undefined ? {} : { status: base.status }),
  };
}

export function buildDownloadEventsExportInput(
  input: DownloadEventsQueryFields,
  options?: { limit?: number; order?: "asc" | "desc" },
): DownloadEventsExportInput {
  const base = normalizeDownloadEventsQueryFields(input);

  return {
    ...(base.mediaId === undefined ? {} : { mediaId: base.mediaId }),
    ...(base.downloadId === undefined ? {} : { downloadId: base.downloadId }),
    ...(base.endDate === undefined ? {} : { endDate: base.endDate }),
    ...(base.eventType === undefined ? {} : { eventType: base.eventType }),
    limit: options?.limit ?? 10_000,
    order: options?.order ?? "desc",
    ...(base.startDate === undefined ? {} : { startDate: base.startDate }),
    ...(base.status === undefined ? {} : { status: base.status }),
  };
}
