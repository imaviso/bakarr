import type { AppDatabase } from "../../db/database.ts";
import { downloads } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { decodeOptionalNumberList, encodeOptionalNumberList } from "../system/config-codec.ts";
import { scanVideoFiles } from "./file-scanner.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  parseFileSourceIdentity,
} from "../../lib/media-identity.ts";
import type { QBitTorrentFile } from "./qbittorrent.ts";

export function parseMagnetInfoHash(magnet: string | null | undefined): string | undefined {
  if (!magnet) {
    return undefined;
  }

  const match = magnet.match(/xt=urn:btih:([^&]+)/i);
  return match?.[1]?.toLowerCase();
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
    const candidates = files.filter((file) => {
      const classification = classifyMediaArtifact(file.path, file.name);
      return classification.kind !== "extra" && classification.kind !== "sample";
    });
    const matching = candidates.find((file) =>
      matchesCompletedDownloadFile(file.path, episodeNumber, options?.expectedAirDate),
    );

    if (matching) {
      return matching.path;
    }

    if (candidates.length === 1) {
      return candidates[0].path;
    }

    return undefined;
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

  const files = yield* scanVideoFiles(fs, contentPath);
  return files
    .filter((file) => {
      const classification = classifyMediaArtifact(file.path, file.name);
      return classification.kind !== "extra" && classification.kind !== "sample";
    })
    .map((file) => file.path);
});

export function toCoveredEpisodesJson(episodes: readonly number[]): string | null {
  return encodeOptionalNumberList(episodes);
}

export function parseCoveredEpisodes(value: string | null | undefined): number[] {
  return decodeOptionalNumberList(value);
}

const IN_FLIGHT_STATUSES = ["queued", "downloading", "paused"];

export async function hasOverlappingDownload(
  db: AppDatabase,
  animeId: number,
  infoHash: string,
  coveredEpisodes: readonly number[],
): Promise<boolean> {
  const existingByHash = await db
    .select({
      id: downloads.id,
      status: downloads.status,
    })
    .from(downloads)
    .where(eq(downloads.infoHash, infoHash))
    .limit(1);

  if (existingByHash[0] && IN_FLIGHT_STATUSES.includes(existingByHash[0].status)) {
    return true;
  }

  if (coveredEpisodes.length === 0) {
    return false;
  }

  const rows = await db.select().from(downloads).where(eq(downloads.animeId, animeId));

  return rows
    .filter((row) => IN_FLIGHT_STATUSES.includes(row.status))
    .some((row) => {
      const existingCovered = parseCoveredEpisodes(row.coveredEpisodes);
      return existingCovered.some((episode) => coveredEpisodes.includes(episode));
    });
}

export function inferCoveredEpisodeNumbers(input: {
  readonly explicitEpisodes: readonly number[];
  readonly isBatch: boolean;
  readonly totalEpisodes?: number | null;
  readonly missingEpisodes: readonly number[];
  readonly requestedEpisode: number;
}): readonly number[] {
  if (input.explicitEpisodes.length > 0) {
    return [...new Set(input.explicitEpisodes)].sort((left, right) => left - right);
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

  if (input.totalEpisodes && input.totalEpisodes >= input.requestedEpisode) {
    return rangeArray(input.requestedEpisode, input.totalEpisodes);
  }

  return [input.requestedEpisode];
}

export function inferCoveredEpisodesFromTorrentContents(input: {
  readonly files: readonly QBitTorrentFile[];
  readonly rootName: string;
}) {
  const episodes = new Set<number>();

  for (const file of input.files) {
    const fullPath = `${input.rootName.replace(/\/+$/, "")}/${file.name.replace(/^\/+/, "")}`;
    const fileName = file.name.split("/").pop() ?? file.name;
    const classification = classifyMediaArtifact(fullPath, fileName);

    if (classification.kind !== "episode") {
      continue;
    }

    const context = buildPathParseContext(input.rootName, fullPath);
    const parsed = parseFileSourceIdentity(fullPath, context);
    const identity = parsed.source_identity;

    if (!identity || identity.scheme === "daily") {
      continue;
    }

    for (const episode of identity.episode_numbers) {
      episodes.add(episode);
    }
  }

  return [...episodes].sort((left, right) => left - right);
}

export function resolveReconciledBatchEpisodeNumbers(input: {
  readonly path: string;
  readonly coveredEpisodes: readonly number[];
  readonly totalCandidateCount: number;
}) {
  const identity = parseFileSourceIdentity(input.path).source_identity;

  if (identity && identity.scheme !== "daily") {
    return [...identity.episode_numbers];
  }

  if (input.totalCandidateCount === 1 && input.coveredEpisodes.length > 0) {
    return [...input.coveredEpisodes];
  }

  return [];
}

function rangeArray(start: number, end: number): number[] {
  const values: number[] = [];

  for (let value = start; value <= end; value += 1) {
    values.push(value);
  }

  return values;
}

export const resolveAccessibleDownloadPath = Effect.fn("Operations.resolveAccessibleDownloadPath")(
  function* (fs: FileSystemShape, contentPath: string, remotePathMappings: readonly string[][]) {
    const candidates = [contentPath, ...applyRemotePathMappings(contentPath, remotePathMappings)];

    for (const candidate of candidates) {
      const statResult = yield* Effect.either(fs.stat(candidate));

      if (statResult._tag === "Right") {
        return candidate;
      }
    }

    return undefined;
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
