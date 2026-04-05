import { Effect, Option } from "effect";

import type { FileSystemShape } from "@/lib/filesystem.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/lib/media-identity.ts";
import { scanVideoFiles } from "@/features/operations/file-scanner.ts";

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
    const statResult = yield* Effect.either(fs.stat(contentPath));

    if (statResult._tag === "Left") {
      return Option.none();
    }

    const stat = statResult.right;

    if (stat.isFile) {
      return Option.some(contentPath);
    }

    if (!stat.isDirectory) {
      return Option.none();
    }

    const files = yield* scanVideoFiles(fs, contentPath).pipe(
      Effect.catchTag("FileSystemError", () => Effect.succeed([])),
    );
    const candidates = files.filter((file) => {
      const classification = classifyMediaArtifact(file.path, file.name);
      return classification.kind !== "extra" && classification.kind !== "sample";
    });
    const matching = candidates.find((file) =>
      matchesCompletedDownloadFile(file.path, episodeNumber, options?.expectedAirDate),
    );

    if (matching) {
      return Option.some(matching.path);
    }

    if (candidates.length === 1) {
      const [onlyCandidate] = candidates;
      if (onlyCandidate) {
        return Option.some(onlyCandidate.path);
      }
    }

    return Option.none();
  },
);

export const resolveBatchContentPaths = Effect.fn("Operations.resolveBatchContentPaths")(function* (
  fs: FileSystemShape,
  contentPath: string,
) {
  const statResult = yield* Effect.either(fs.stat(contentPath));

  if (statResult._tag === "Left") {
    return [];
  }

  const stat = statResult.right;

  if (stat.isFile) {
    return [contentPath];
  }

  if (!stat.isDirectory) {
    return [];
  }

  const files = yield* scanVideoFiles(fs, contentPath).pipe(
    Effect.catchTag("FileSystemError", () => Effect.succeed([])),
  );
  return files
    .filter((file) => {
      const classification = classifyMediaArtifact(file.path, file.name);
      return classification.kind !== "extra" && classification.kind !== "sample";
    })
    .map((file) => file.path);
});

export const resolveAccessibleDownloadPath = Effect.fn("Operations.resolveAccessibleDownloadPath")(
  function* (fs: FileSystemShape, contentPath: string, remotePathMappings: readonly string[][]) {
    const candidates = [contentPath, ...applyRemotePathMappings(contentPath, remotePathMappings)];

    for (const candidate of candidates) {
      const statResult = yield* Effect.either(fs.stat(candidate));

      if (statResult._tag === "Right") {
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
