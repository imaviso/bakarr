import type { AppDatabase } from "../../db/database.ts";
import { downloads } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import {
  decodeOptionalNumberList,
  encodeOptionalNumberList,
} from "../system/config-codec.ts";
import { parseEpisodeNumber, scanVideoFiles } from "./file-scanner.ts";

export function parseMagnetInfoHash(
  magnet: string | null | undefined,
): string | undefined {
  if (!magnet) {
    return undefined;
  }

  const match = magnet.match(/xt=urn:btih:([^&]+)/i);
  return match?.[1]?.toLowerCase();
}

export async function resolveCompletedContentPath(
  contentPath: string,
  episodeNumber: number,
): Promise<string | undefined> {
  try {
    const stat = await Deno.stat(contentPath);

    if (stat.isFile) {
      return contentPath;
    }

    if (!stat.isDirectory) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const files = await scanVideoFiles(contentPath);
  const matching = files.find((file) =>
    parseEpisodeNumber(file.path) === episodeNumber
  );

  return matching?.path ?? files[0]?.path;
}

export async function resolveBatchContentPaths(
  contentPath: string,
): Promise<readonly string[]> {
  try {
    const stat = await Deno.stat(contentPath);

    if (stat.isFile) {
      return [contentPath];
    }

    if (!stat.isDirectory) {
      return [];
    }
  } catch {
    return [];
  }

  const files = await scanVideoFiles(contentPath);
  return files.map((file) => file.path);
}

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

export async function resolveAccessibleDownloadPath(
  contentPath: string,
  remotePathMappings: readonly string[][],
): Promise<string | undefined> {
  const candidates = [
    contentPath,
    ...applyRemotePathMappings(contentPath, remotePathMappings),
  ];

  for (const candidate of candidates) {
    try {
      await Deno.stat(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return undefined;
}

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

    if (!contentPath.startsWith(remotePrefix)) {
      continue;
    }

    results.push(`${localPrefix}${contentPath.slice(remotePrefix.length)}`);
  }

  return results;
}

export { parseEpisodeNumber, scanVideoFiles };
