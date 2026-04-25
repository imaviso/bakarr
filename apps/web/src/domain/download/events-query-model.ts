import type { DownloadEventsExportInput, DownloadEventsFilterInput } from "~/api/contracts";

export interface DownloadEventsQueryFields {
  animeId: string;
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
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeDownloadEventsQueryFields(input: DownloadEventsQueryFields) {
  return {
    animeId: parseOptionalPositiveInt(input.animeId),
    downloadId: parseOptionalPositiveInt(input.downloadId),
    endDate: input.endDate || undefined,
    eventType: input.eventType === "all" ? undefined : input.eventType,
    startDate: input.startDate || undefined,
    status: input.status || undefined,
  };
}

export function buildDownloadEventsFilterInput(
  input: DownloadEventsFilterFields,
  options?: { limit?: number },
): DownloadEventsFilterInput {
  const base = normalizeDownloadEventsQueryFields(input);

  return {
    direction: input.direction,
    ...(base.animeId === undefined ? {} : { animeId: base.animeId }),
    ...(input.cursor ? { cursor: input.cursor } : {}),
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
    ...(base.animeId === undefined ? {} : { animeId: base.animeId }),
    ...(base.downloadId === undefined ? {} : { downloadId: base.downloadId }),
    ...(base.endDate === undefined ? {} : { endDate: base.endDate }),
    ...(base.eventType === undefined ? {} : { eventType: base.eventType }),
    limit: options?.limit ?? 10_000,
    order: options?.order ?? "desc",
    ...(base.startDate === undefined ? {} : { startDate: base.startDate }),
    ...(base.status === undefined ? {} : { status: base.status }),
  };
}
