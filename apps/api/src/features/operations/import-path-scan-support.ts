import { Effect } from "effect";

import type { ScanResult } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { AniListClient } from "../anime/anilist.ts";
import { OperationsPathError } from "./errors.ts";
import { scanVideoFiles } from "./file-scanner.ts";
import {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  titlesMatch,
  toAnimeSearchCandidate,
} from "./library-import.ts";
import { requireAnime } from "./repository.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";

export const scanImportPathEffect = Effect.fn(
  "OperationsService.scanImportPathEffect",
)(function* (input: {
  aniList: typeof AniListClient.Service;
  animeId?: number;
  db: AppDatabase;
  fs: FileSystemShape;
  path: string;
  tryDatabasePromise: TryDatabasePromise;
  tryOperationsPromise: TryOperationsPromise;
}) {
  const canonicalPath = yield* input.fs.realPath(input.path).pipe(
    Effect.mapError(() =>
      new OperationsPathError({
        message: `Import path is inaccessible: ${input.path}`,
      })
    ),
  );

  const files = [
    ...yield* scanVideoFiles(input.fs, canonicalPath).pipe(
      Effect.mapError(() =>
        new OperationsPathError({
          message: `Import path is inaccessible: ${canonicalPath}`,
        })
      ),
    ),
  ].sort((a, b) => a.path.localeCompare(b.path));
  const animeRows = input.animeId
    ? [
      yield* input.tryOperationsPromise("Failed to scan import path", () =>
        requireAnime(input.db, input.animeId!)),
    ]
    : yield* input.tryDatabasePromise(
      "Failed to scan import path",
      () => input.db.select().from(anime),
    );
  const analyzed = files.map((file) => analyzeScannedFile(file, canonicalPath));
  const episodeFiles = analyzed.filter((entry) => !entry.skipped);
  const skippedFiles = analyzed.filter((entry) => entry.skipped).map((entry) =>
    entry.skipped!
  );

  const candidateMap = new Map<
    number,
    ReturnType<typeof toAnimeSearchCandidate>
  >();

  if (input.animeId) {
    const row = animeRows[0];
    candidateMap.set(row.id, toAnimeSearchCandidate(row));
  } else {
    const parsedTitles = [
      ...new Set(
        episodeFiles
          .map((entry) => entry.scanned.parsed_title)
          .filter((value) => value.length > 0),
      ),
    ].slice(0, 8);

    for (const parsedTitle of parsedTitles) {
      const remoteCandidates = yield* input.aniList.searchAnimeMetadata(
        parsedTitle,
      );

      for (const candidate of remoteCandidates.slice(0, 5)) {
        candidateMap.set(candidate.id, candidate);
      }
    }
  }

  for (const row of animeRows) {
    candidateMap.set(row.id, toAnimeSearchCandidate(row));
  }

  return {
    candidates: [...candidateMap.values()],
    files: episodeFiles.map((entry) => {
      const file = entry.scanned;
      const localMatch = input.animeId
        ? animeRows[0]
        : findBestLocalAnimeMatch(file.parsed_title, animeRows);
      const remoteCandidate = !input.animeId && !localMatch
        ? [...candidateMap.values()].find((candidate) =>
          titlesMatch(file.parsed_title, candidate)
        )
        : undefined;

      return {
        episode_number: file.episode_number,
        episode_numbers: file.episode_numbers,
        filename: file.filename,
        group: file.group,
        matched_anime: localMatch
          ? { id: localMatch.id, title: localMatch.titleRomaji }
          : undefined,
        needs_manual_mapping: file.needs_manual_mapping,
        parsed_title: file.parsed_title,
        resolution: file.resolution,
        season: file.season,
        source_identity: file.source_identity,
        source_path: file.source_path,
        suggested_candidate_id: localMatch?.id ?? remoteCandidate?.id,
      };
    }),
    skipped: skippedFiles,
  } satisfies ScanResult;
});
