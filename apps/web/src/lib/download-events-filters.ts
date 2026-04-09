import type { DownloadEventsFilterInput } from "~/lib/api";

interface DownloadEventsSearchInput {
  animeId: string;
  cursor: string;
  direction: "next" | "prev";
  downloadId: string;
  endDate: string;
  eventType: string;
  startDate: string;
  status: string;
}

export function parseOptionalPositiveInt(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildDownloadEventsFilterInput(input: DownloadEventsSearchInput) {
  const result: DownloadEventsFilterInput = {
    direction: input.direction,
    limit: 24,
  };

  const animeId = parseOptionalPositiveInt(input.animeId);
  if (animeId !== undefined) {
    result.animeId = animeId;
  }

  const cursor = input.cursor || undefined;
  if (cursor !== undefined) {
    result.cursor = cursor;
  }

  const downloadId = parseOptionalPositiveInt(input.downloadId);
  if (downloadId !== undefined) {
    result.downloadId = downloadId;
  }

  const endDate = input.endDate || undefined;
  if (endDate !== undefined) {
    result.endDate = endDate;
  }

  const eventType = input.eventType === "all" ? undefined : input.eventType;
  if (eventType !== undefined) {
    result.eventType = eventType;
  }

  const startDate = input.startDate || undefined;
  if (startDate !== undefined) {
    result.startDate = startDate;
  }

  const status = input.status || undefined;
  if (status !== undefined) {
    result.status = status;
  }

  return result;
}
