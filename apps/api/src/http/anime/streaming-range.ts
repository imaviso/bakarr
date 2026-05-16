import { Effect } from "effect";

import type { FileByteRange } from "@/http/file-stream.ts";
import { EpisodeStreamRangeError } from "@/features/anime/stream/anime-stream-errors.ts";

export function parseEpisodeStreamRange(
  rangeHeader: string | undefined,
  fileSize: number,
): Effect.Effect<FileByteRange | undefined, EpisodeStreamRangeError> {
  if (!rangeHeader) {
    return Effect.sync(() => undefined);
  }

  const normalizedHeader = rangeHeader.trim();

  if (!normalizedHeader.toLowerCase().startsWith("bytes=")) {
    return failRange(fileSize);
  }

  const rangeSet = normalizedHeader.slice("bytes=".length).trim();

  if (rangeSet.length === 0 || rangeSet.includes(",")) {
    return failRange(fileSize);
  }

  const suffixMatch = /^(\d+)$/.exec(rangeSet.startsWith("-") ? rangeSet.slice(1) : "");

  if (rangeSet.startsWith("-")) {
    if (!suffixMatch) {
      return failRange(fileSize);
    }

    const suffixValue = suffixMatch[1];
    const suffixLength = suffixValue ? parseStrictPositiveInteger(suffixValue) : undefined;

    if (suffixLength === undefined || fileSize <= 0) {
      return failRange(fileSize);
    }

    const resolvedLength = Math.min(suffixLength, fileSize);
    const start = fileSize - resolvedLength;

    return Effect.succeed({
      end: fileSize - 1,
      start,
    });
  }

  const match = /^(\d+)-(\d*)$/.exec(rangeSet);

  if (!match) {
    return failRange(fileSize);
  }

  const startValue = match[1];
  const endValue = match[2];
  const start = startValue ? parseStrictNonNegativeInteger(startValue) : undefined;
  const end =
    endValue && endValue.length > 0 ? parseStrictNonNegativeInteger(endValue) : fileSize - 1;

  if (start === undefined || end === undefined || !isValidAbsoluteRange(start, end, fileSize)) {
    return failRange(fileSize);
  }

  return Effect.succeed({
    end,
    start,
  });
}

function parseStrictNonNegativeInteger(value: string) {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseStrictPositiveInteger(value: string) {
  const parsed = parseStrictNonNegativeInteger(value);

  if (parsed === undefined || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function isValidAbsoluteRange(start: number, end: number, fileSize: number) {
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end >= start &&
    start < fileSize &&
    end < fileSize
  );
}

function failRange(fileSize: number) {
  return Effect.fail(
    new EpisodeStreamRangeError({
      fileSize,
      message: "Requested range not satisfiable",
      status: 416,
    }),
  );
}
