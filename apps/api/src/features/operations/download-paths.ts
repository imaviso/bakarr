import { Effect, Option, Stream } from "effect";

import type { FileSystemShape } from "@/lib/filesystem.ts";
import { isNotFoundError } from "@/lib/fs-errors.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/lib/media-identity.ts";
import { scanVideoFiles, scanVideoFilesStream } from "@/features/operations/file-scanner.ts";

export function parseMagnetInfoHash(magnet: string | null | undefined): Option.Option<string> {
  if (!magnet) {
    return Option.none();
  }

  const match = magnet.match(/xt=urn:btih:([^&]+)/i);

  return match?.[1] ? Option.some(match[1].toLowerCase()) : Option.none();
}

export const resolveCompletedContentPath = Effect.fn("Operations.resolveCompletedContentPath")(
  function* (
    fs: FileSystemShape,
    contentPath: string,
    episodeNumber: number,
    options?: { expectedAirDate?: string },
  ) {
    const stat = yield* statMaybe(fs, contentPath);

    if (Option.isNone(stat)) {
      return Option.none();
    }

    const statValue = stat.value;

    if (statValue.isFile) {
      return Option.some(contentPath);
    }

    if (!statValue.isDirectory) {
      return Option.none();
    }

    const scanState = yield* Stream.runFold(
      scanVideoFilesStream(fs, contentPath),
      {
        candidateCount: 0,
        firstCandidatePath: Option.none<string>(),
        matchingPath: Option.none<string>(),
      },
      (state, file) => {
        const classification = classifyMediaArtifact(file.path, file.name);

        if (classification.kind === "extra" || classification.kind === "sample") {
          return state;
        }

        const candidateCount = state.candidateCount + 1;
        const firstCandidatePath =
          candidateCount === 1 ? Option.some(file.path) : state.firstCandidatePath;
        const matchingPath = Option.isSome(state.matchingPath)
          ? state.matchingPath
          : matchesCompletedDownloadFile(file.path, episodeNumber, options?.expectedAirDate)
            ? Option.some(file.path)
            : Option.none<string>();

        return {
          candidateCount,
          firstCandidatePath,
          matchingPath,
        };
      },
    );

    if (Option.isSome(scanState.matchingPath)) {
      return Option.some(scanState.matchingPath.value);
    }

    if (scanState.candidateCount === 1 && Option.isSome(scanState.firstCandidatePath)) {
      return Option.some(scanState.firstCandidatePath.value);
    }

    return Option.none();
  },
);

export const resolveBatchContentPaths = Effect.fn("Operations.resolveBatchContentPaths")(function* (
  fs: FileSystemShape,
  contentPath: string,
) {
  const stat = yield* statMaybe(fs, contentPath);

  if (Option.isNone(stat)) {
    return [];
  }

  const statValue = stat.value;

  if (statValue.isFile) {
    return [contentPath];
  }

  if (!statValue.isDirectory) {
    return [];
  }

  return yield* Stream.runFold(
    scanVideoFilesStream(fs, contentPath),
    [] as string[],
    (acc, file) => {
      const classification = classifyMediaArtifact(file.path, file.name);
      return classification.kind === "extra" || classification.kind === "sample"
        ? acc
        : [...acc, file.path];
    },
  );
});

export const resolveAccessibleDownloadPath = Effect.fn("Operations.resolveAccessibleDownloadPath")(
  function* (fs: FileSystemShape, contentPath: string, remotePathMappings: readonly string[][]) {
    const candidates = [contentPath, ...applyRemotePathMappings(contentPath, remotePathMappings)];

    for (const candidate of candidates) {
      const stat = yield* statMaybe(fs, candidate);

      if (Option.isSome(stat)) {
        return Option.some(candidate);
      }
    }

    return Option.none();
  },
);

export function applyRemotePathMappings(
  contentPath: string,
  remotePathMappings: readonly string[][],
): readonly string[] {
  const results: string[] = [];

  for (const mapping of remotePathMappings) {
    const [remotePrefix, localPrefix] = mapping;

    if (!remotePrefix || !localPrefix) {
      continue;
    }

    const normalizedRemote = remotePrefix.replace(/\/+$/, "");
    const normalizedLocal = localPrefix.replace(/\/+$/, "");

    if (contentPath === normalizedRemote) {
      results.push(normalizedLocal);
      continue;
    }

    if (contentPath.startsWith(`${normalizedRemote}/`)) {
      results.push(`${normalizedLocal}${contentPath.slice(normalizedRemote.length)}`);
    }
  }

  return results;
}

export { scanVideoFiles };

const statMaybe = Effect.fn("Operations.statMaybe")(function* (fs: FileSystemShape, path: string) {
  return yield* fs.stat(path).pipe(
    Effect.map(Option.some),
    Effect.catchTag("FileSystemError", (error) =>
      isNotFoundError(error) ? Effect.succeed(Option.none()) : Effect.fail(error),
    ),
  );
});

function matchesCompletedDownloadFile(
  path: string,
  episodeNumber: number,
  expectedAirDate?: string,
) {
  const identity = parseFileSourceIdentity(path).source_identity;

  if (!identity) {
    return false;
  }

  if (identity.scheme === "daily") {
    return expectedAirDate ? identity.air_dates.includes(expectedAirDate) : false;
  }

  return identity.episode_numbers.includes(episodeNumber);
}
