import type { AppDatabase } from "../../db/database.ts";
import { downloads } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import {
  decodeOptionalNumberList,
  encodeOptionalNumberList,
} from "../system/config-codec.ts";
import { parseEpisodeNumber, scanVideoFiles } from "./file-scanner.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";

export function parseMagnetInfoHash(
  magnet: string | null | undefined,
): string | undefined {
  if (!magnet) {
    return undefined;
  }

  const match = magnet.match(/xt=urn:btih:([^&]+)/i);
  return match?.[1]?.toLowerCase();
}

export const resolveCompletedContentPath = Effect.fn(
  "Operations.resolveCompletedContentPath",
)(function* (
  fs: FileSystemShape,
  contentPath: string,
  episodeNumber: number,
) {
  const statResult = yield* Effect.either(fs.stat(contentPath));

  if (statResult._tag === "Left") {
    return undefined;
  }

  const stat = statResult.right;

  if (stat.isFile) {
    return contentPath;
  }

  if (!stat.isDirectory) {
    return undefined;
  }

  const files = yield* scanVideoFiles(fs, contentPath);
  const matching = files.find((file) =>
    parseEpisodeNumber(file.path) === episodeNumber
  );

  return matching?.path ?? files[0]?.path;
});

export const resolveBatchContentPaths = Effect.fn(
  "Operations.resolveBatchContentPaths",
)(function* (
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

  const files = yield* scanVideoFiles(fs, contentPath);
  return files.map((file) => file.path);
});

export function toCoveredEpisodesJson(
  episodes: readonly number[],
): string | null {
  return encodeOptionalNumberList(episodes);
}

export function parseCoveredEpisodes(
  value: string | null | undefined,
): number[] {
  return decodeOptionalNumberList(value);
}

export async function hasOverlappingDownload(
  db: AppDatabase,
  animeId: number,
  infoHash: string,
  coveredEpisodes: readonly number[],
): Promise<boolean> {
  const existingByHash = await db.select({ id: downloads.id }).from(downloads)
    .where(eq(downloads.infoHash, infoHash)).limit(1);

  if (existingByHash[0]) {
    return true;
  }

  if (coveredEpisodes.length === 0) {
    return false;
  }

  const rows = await db.select().from(downloads).where(
    eq(downloads.animeId, animeId),
  );

  return rows.some((row) => {
    const existingCovered = parseCoveredEpisodes(row.coveredEpisodes);
    return existingCovered.some((episode) => coveredEpisodes.includes(episode));
  });
}

export function inferCoveredEpisodeNumbers(input: {
  readonly explicitEpisodes: readonly number[];
  readonly isBatch: boolean;
  readonly missingEpisodes: readonly number[];
  readonly requestedEpisode: number;
}): readonly number[] {
  if (input.explicitEpisodes.length > 0) {
    return [...new Set(input.explicitEpisodes)].sort((left, right) =>
      left - right
    );
  }

  if (!input.isBatch) {
    return [input.requestedEpisode];
  }

  const filtered = [...new Set(input.missingEpisodes)]
    .filter((episode) => episode >= input.requestedEpisode)
    .sort((left, right) => left - right);

  if (filtered.length > 0) {
    const contiguous: number[] = [filtered[0]];

    for (let index = 1; index < filtered.length; index += 1) {
      if (filtered[index] !== contiguous[contiguous.length - 1] + 1) {
        break;
      }

      contiguous.push(filtered[index]);
    }

    return contiguous;
  }

  return [input.requestedEpisode];
}

export const resolveAccessibleDownloadPath = Effect.fn(
  "Operations.resolveAccessibleDownloadPath",
)(function* (
  fs: FileSystemShape,
  contentPath: string,
  remotePathMappings: readonly string[][],
) {
  const candidates = [
    contentPath,
    ...applyRemotePathMappings(contentPath, remotePathMappings),
  ];

  for (const candidate of candidates) {
    const statResult = yield* Effect.either(fs.stat(candidate));

    if (statResult._tag === "Right") {
      return candidate;
    }
  }

  return undefined;
});

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
      results.push(
        `${normalizedLocal}${contentPath.slice(normalizedRemote.length)}`,
      );
    }
  }

  return results;
}

export { parseEpisodeNumber, scanVideoFiles };
