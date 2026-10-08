import {
  encodeOptionalNumberList,
  decodeOptionalNumberList,
} from "@/features/system/profile-codec.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  parseFileSourceIdentity,
} from "@/features/media/identity/identity.ts";
import {
  VIDEO_UNIT_FILE_EXTENSIONS,
  VOLUME_UNIT_FILE_EXTENSIONS,
} from "@/features/media/files/media-file-path-policy.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";
import type { TorrentFile } from "@/features/operations/torrent/torrent-domain.ts";
import { StoredDataError } from "@/features/errors.ts";
import type { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { Effect } from "effect";

const IN_FLIGHT_STATUSES = new Set(["queued", "downloading", "paused"]);

export function toCoveredUnitsJson(
  mediaUnits: readonly number[],
): Effect.Effect<string | null, StoredDataError> {
  return encodeOptionalNumberList(mediaUnits).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Covered mediaUnits metadata is invalid",
        }),
    ),
  );
}

export const parseCoveredUnitsEffect = Effect.fn("Operations.parseCoveredUnitsEffect")(function* (
  value: string | null | undefined,
) {
  return yield* decodeOptionalNumberList(value).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Stored covered episode metadata is corrupt",
        }),
    ),
  );
});

export const hasOverlappingDownload = Effect.fn("Operations.hasOverlappingDownload")(function* (
  downloadRepository: typeof DownloadRepository.Service,
  mediaId: number,
  infoHash: string | null,
  coveredUnits: readonly number[],
) {
  // Magnets without a btih `xt` have no hash — covered-units overlap is then
  // the only dedupe signal, so it must run regardless of the hash. Known gap:
  // hash-less magnets with no covered units have zero dedupe; repeated queue
  // attempts enqueue duplicates (acceptable single-user trade-off — coverage
  // is usually inferable from the release title).
  if (infoHash) {
    const existingByHash = yield* downloadRepository.lookupDownloadByInfoHash(infoHash);

    if (existingByHash && IN_FLIGHT_STATUSES.has(existingByHash.status)) {
      return true;
    }
  }

  if (coveredUnits.length === 0) {
    return false;
  }

  const rows = yield* downloadRepository.listDownloadsByMediaId(mediaId);

  for (const row of rows) {
    if (!IN_FLIGHT_STATUSES.has(row.status)) {
      continue;
    }

    const existingCovered = yield* parseCoveredUnitsEffect(row.coveredUnits);

    if (existingCovered.some((episode) => coveredUnits.includes(episode))) {
      return true;
    }
  }

  return false;
});

export function inferCoveredUnitNumbers(input: {
  readonly explicitEpisodes: readonly number[];
  readonly isBatch: boolean;
  readonly totalUnits?: number | null;
  readonly missingUnits: readonly number[];
  readonly requestedEpisode: number;
}): readonly number[] {
  if (input.explicitEpisodes.length > 0) {
    return [...new Set(input.explicitEpisodes)].toSorted((left, right) => left - right);
  }

  if (!input.isBatch) {
    return [input.requestedEpisode];
  }

  const filtered = [...new Set(input.missingUnits)]
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

  if (input.totalUnits && input.totalUnits >= input.requestedEpisode) {
    return rangeArray(input.requestedEpisode, input.totalUnits);
  }

  return [input.requestedEpisode];
}

export type CoverageFileMatch =
  | { readonly _tag: "Skip" }
  | { readonly _tag: "Units"; readonly units: readonly number[] }
  | { readonly _tag: "ParseIdentity" };

/**
 * Single file-coverage core shared by torrent-list refinement and on-disk
 * reconcile scans. Cross-type guard + volume extraction live here once;
 * each caller keeps its own candidate rule (refine accepts only
 * `episode`-classified files, reconcile skips only extras/samples) so
 * behavior at each site is unchanged.
 */
export function matchCoverageFile(input: {
  readonly fileName: string;
  readonly fullPath: string;
  readonly isCandidate: boolean;
  readonly wantVolumes: boolean;
}): CoverageFileMatch {
  // Cross-type files never contribute coverage: anime episodes must not
  // refine manga coverage (and vice versa) when torrents share a client
  // save directory with unrelated downloads.
  if (
    hasUnitExtension(
      input.fileName,
      input.wantVolumes ? VIDEO_UNIT_FILE_EXTENSIONS : VOLUME_UNIT_FILE_EXTENSIONS,
    )
  ) {
    return { _tag: "Skip" };
  }

  if (!input.isCandidate) {
    return { _tag: "Skip" };
  }

  if (input.wantVolumes) {
    const volumes = parseVolumeNumbersFromTitle(input.fileName);
    if (volumes.length > 0) {
      return { _tag: "Units", units: volumes };
    }
  }

  return { _tag: "ParseIdentity" };
}

export function inferCoveredUnitsFromTorrentContents(input: {
  readonly files: readonly TorrentFile[];
  readonly parseVolumeNumbers?: boolean;
  readonly rootName: string;
}) {
  const mediaUnits = new Set<number>();
  const wantVolumes = input.parseVolumeNumbers === true;

  for (const file of input.files) {
    const fullPath = `${input.rootName.replace(/\/+$/, "")}/${file.name.replace(/^\/+/, "")}`;
    const fileName = file.name.split("/").pop() ?? file.name;

    const match = matchCoverageFile({
      fileName,
      fullPath,
      isCandidate: classifyMediaArtifact(fullPath, fileName).kind === "episode",
      wantVolumes,
    });
    if (match._tag === "Skip") {
      continue;
    }
    if (match._tag === "Units") {
      for (const volume of match.units) {
        mediaUnits.add(volume);
      }
      continue;
    }

    const context = buildPathParseContext(input.rootName, fullPath);
    const parsed = parseFileSourceIdentity(fullPath, context);
    const identity = parsed.source_identity;

    if (!identity || identity.scheme === "daily") {
      continue;
    }

    for (const episode of identity.unit_numbers) {
      mediaUnits.add(episode);
    }
  }

  return [...mediaUnits].toSorted((left, right) => left - right);
}

function isSkippedCoverageArtifact(path: string, fileName: string): boolean {
  const classification = classifyMediaArtifact(path, fileName);
  return classification.kind === "extra" || classification.kind === "sample";
}

export function resolveReconciledBatchUnitNumbers(input: {
  readonly path: string;
  readonly coveredUnits: readonly number[];
  readonly parseVolumeNumbers?: boolean;
  readonly totalCandidateCount: number;
}) {
  const fileName = input.path.split("/").pop() ?? input.path;
  const wantVolumes = input.parseVolumeNumbers === true;

  const match = matchCoverageFile({
    fileName,
    fullPath: input.path,
    isCandidate: !isSkippedCoverageArtifact(input.path, fileName),
    wantVolumes,
  });
  if (match._tag === "Skip") {
    return [];
  }
  if (match._tag === "Units") {
    return [...match.units];
  }

  const identity = parseFileSourceIdentity(input.path).source_identity;

  if (identity && identity.scheme !== "daily") {
    return [...identity.unit_numbers];
  }

  if (input.totalCandidateCount === 1 && input.coveredUnits.length > 0) {
    return [...input.coveredUnits];
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

function hasUnitExtension(name: string, extensions: readonly string[]) {
  const lower = name.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}
