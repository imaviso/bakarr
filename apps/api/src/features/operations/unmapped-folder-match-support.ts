import { Effect } from "effect";

import type { ScannerState } from "../../../../../packages/shared/src/index.ts";
import { anime } from "../../db/schema.ts";
import {
  buildUnmappedFolderSearchQueries,
} from "./unmapped-folders.ts";
import {
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
  toAnimeSearchCandidate,
} from "./library-import.ts";

export const findLocalFolderAnimeMatch = Effect.fn("OperationsService.findLocalFolderAnimeMatch")(
  function* (folderName: string, animeRows: ReadonlyArray<typeof anime.$inferSelect>) {
    const queries = buildUnmappedFolderSearchQueries(folderName);

    for (const [index, query] of queries.entries()) {
      const match = findBestLocalAnimeMatch(query, [...animeRows]);

      if (match) {
        return {
          ...(yield* toAnimeSearchCandidate(match)),
          match_confidence: roundConfidence(scoreAnimeRowMatch(query, match)),
          match_reason:
            index === 0
              ? `Matched a library title from the normalized folder name "${folderName}"`
              : `Matched a library title after removing season or release noise from "${folderName}"`,
        };
      }
    }

    return undefined;
  },
);

export const mergeLocalFolderMatch = Effect.fn("OperationsService.mergeLocalFolderMatch")(
  function* (
    folder: ScannerState["folders"][number],
    animeRows: ReadonlyArray<typeof anime.$inferSelect>,
  ) {
    const localMatch = yield* findLocalFolderAnimeMatch(folder.name, animeRows);

    if (!localMatch) {
      return folder;
    }

    return {
      ...folder,
      suggested_matches: [
        localMatch,
        ...folder.suggested_matches.filter((candidate) => candidate.id !== localMatch.id),
      ],
    };
  },
);

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}
