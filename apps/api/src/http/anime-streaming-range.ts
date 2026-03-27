import { Effect } from "effect";

import type { FileByteRange } from "./file-stream.ts";
import { EpisodeStreamRangeError } from "./streaming-errors.ts";

export function parseEpisodeStreamRange(
  rangeHeader: string | undefined,
  fileSize: number,
): Effect.Effect<FileByteRange | undefined, EpisodeStreamRangeError> {
  if (!rangeHeader) {
    return Effect.sync(() => undefined as undefined);
  }

  const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/i.exec(rangeHeader.trim());

  if (!match) {
    return failRange(fileSize);
  }

  const startInput = match[1];
  const endInput = match[2];
  const suffixLengthInput = match[3];

  if (startInput !== undefined) {
    const start = Number.parseInt(startInput, 10);
    const end = endInput.length > 0 ? Number.parseInt(endInput, 10) : fileSize - 1;

    if (!isValidAbsoluteRange(start, end, fileSize)) {
      return failRange(fileSize);
    }

    return Effect.succeed({ end, start });
  }

  const suffixLength = Number.parseInt(suffixLengthInput, 10);

  if (!Number.isInteger(suffixLength) || suffixLength <= 0 || fileSize <= 0) {
    return failRange(fileSize);
  }

  const resolvedLength = Math.min(suffixLength, fileSize);
  const start = fileSize - resolvedLength;

  return Effect.succeed({
    end: fileSize - 1,
    start,
  });
}

function isValidAbsoluteRange(start: number, end: number, fileSize: number) {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
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
