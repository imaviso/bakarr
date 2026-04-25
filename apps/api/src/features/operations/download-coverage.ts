import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import {
  encodeOptionalNumberList,
  decodeOptionalNumberList,
} from "@/features/system/config-codec.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  parseFileSourceIdentity,
} from "@/infra/media/identity/identity.ts";
import type { QBitTorrentFile } from "@/features/operations/qbittorrent.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { eq } from "drizzle-orm";

const IN_FLIGHT_STATUSES = new Set(["queued", "downloading", "paused"]);

export function toCoveredEpisodesJson(
  episodes: readonly number[],
): Effect.Effect<string | null, OperationsStoredDataError> {
  return encodeOptionalNumberList(episodes).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
          message: "Covered episodes metadata is invalid",
        }),
    ),
  );
}

export const parseCoveredEpisodesEffect = Effect.fn("Operations.parseCoveredEpisodesEffect")(
  function* (value: string | null | undefined) {
    return yield* decodeOptionalNumberList(value).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsStoredDataError({
            cause,
            message: "Stored covered episode metadata is corrupt",
          }),
      ),
    );
  },
);

export const hasOverlappingDownload = Effect.fn("Operations.hasOverlappingDownload")(function* (
  db: AppDatabase,
  animeId: number,
  infoHash: string,
  coveredEpisodes: readonly number[],
) {
  const existingByHash = yield* tryDatabasePromise("Failed to check overlapping download", () =>
    db
      .select({
        id: downloads.id,
        status: downloads.status,
      })
      .from(downloads)
      .where(eq(downloads.infoHash, infoHash))
      .limit(1),
  );

  if (existingByHash[0] && IN_FLIGHT_STATUSES.has(existingByHash[0].status)) {
    return true;
  }

  if (coveredEpisodes.length === 0) {
    return false;
  }

  const rows = yield* tryDatabasePromise("Failed to check overlapping download", () =>
    db.select().from(downloads).where(eq(downloads.animeId, animeId)),
  );

  for (const row of rows) {
    if (!IN_FLIGHT_STATUSES.has(row.status)) {
      continue;
    }

    const existingCovered = yield* parseCoveredEpisodesEffect(row.coveredEpisodes);

    if (existingCovered.some((episode) => coveredEpisodes.includes(episode))) {
      return true;
    }
  }

  return false;
});

export function inferCoveredEpisodeNumbers(input: {
  readonly explicitEpisodes: readonly number[];
  readonly isBatch: boolean;
  readonly totalEpisodes?: number | null;
  readonly missingEpisodes: readonly number[];
  readonly requestedEpisode: number;
}): readonly number[] {
  if (input.explicitEpisodes.length > 0) {
    return [...new Set(input.explicitEpisodes)].toSorted((left, right) => left - right);
  }

  if (!input.isBatch) {
    return [input.requestedEpisode];
  }

  const filtered = [...new Set(input.missingEpisodes)]
    .filter((episode) => episode >= input.requestedEpisode)
    .toSorted((left, right) => left - right);

  if (filtered.length > 0) {
    const firstFiltered = filtered[0];

    if (firstFiltered === undefined) {
      return [input.requestedEpisode];
    }

    const contiguous: number[] = [firstFiltered];

    for (let index = 1; index < filtered.length; index += 1) {
      const current = filtered[index];
      const previous = contiguous[contiguous.length - 1];

      if (current === undefined || previous === undefined || current !== previous + 1) {
        break;
      }

      contiguous.push(current);
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

  return [...episodes].toSorted((left, right) => left - right);
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
