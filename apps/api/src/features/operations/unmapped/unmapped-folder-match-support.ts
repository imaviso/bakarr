import { Effect } from "effect";

import type { ScannerState } from "@packages/shared/index.ts";
import { media } from "@/db/schema.ts";
import { buildUnmappedFolderSearchQueries } from "@/features/operations/unmapped/unmapped-folders.ts";
import {
  findBestLocalMediaMatch,
  scoreMediaRowMatch,
} from "@/features/operations/library/library-import-analysis-support.ts";
import { toMediaSearchCandidate } from "@/features/operations/library/library-import.ts";

export const findLocalFolderMediaMatch = Effect.fn("UnmappedFolderMatch.findLocalFolderMediaMatch")(
  function* (folderName: string, animeRows: ReadonlyArray<typeof media.$inferSelect>) {
    const queries = buildUnmappedFolderSearchQueries(folderName);

    for (const [index, query] of queries.entries()) {
      const match = findBestLocalMediaMatch(query, [...animeRows]);

      if (match) {
        return {
          ...(yield* toMediaSearchCandidate(match)),
          match_confidence: roundConfidence(scoreMediaRowMatch(query, match)),
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

export const mergeLocalFolderMatch = Effect.fn("UnmappedFolderMatch.mergeLocalFolderMatch")(
  function* (
    folder: ScannerState["folders"][number],
    animeRows: ReadonlyArray<typeof media.$inferSelect>,
  ) {
    const localMatch = yield* findLocalFolderMediaMatch(folder.name, animeRows);

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
