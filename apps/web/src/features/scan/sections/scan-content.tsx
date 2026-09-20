import { BackgroundMatchingCard } from "@/features/scan/background-matching-card";
import { EmptyScanState } from "@/features/scan/empty-scan-state";
import { FolderItem } from "@/features/scan/folder-item";
import type {
  MediaSearchResult,
  ScannerMatchCounts,
  ScannerMatchStatus,
  UnmappedFolder,
} from "@/api/contracts";

interface ScanContentProps {
  foldersLength: number;
  counts: ScannerMatchCounts;
  hasOutstandingMatches: boolean;
  isScanning: boolean;
  matchStatus: ScannerMatchStatus;
  folderPaths: readonly string[];
  foldersByPath: Map<string, UnmappedFolder>;
  onOpenManualMatch: (dialogState: {
    folder: UnmappedFolder;
    onSelect: (anime: MediaSearchResult) => void;
  }) => void;
}

export function ScanContent(props: ScanContentProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-6">
      {props.foldersLength > 0 ? (
        <div className="space-y-4">
          <BackgroundMatchingCard
            failedCount={props.counts.failed}
            hasOutstandingWork={props.hasOutstandingMatches}
            status={props.matchStatus}
            matchedCount={props.counts.matched}
            matchingCount={props.counts.matching}
            pausedCount={props.counts.paused}
            queuedCount={props.counts.queued}
            totalCount={props.foldersLength}
          />
          <ul role="list" className="space-y-3">
            {props.folderPaths.map((path) => {
              const folder = props.foldersByPath.get(path);

              return (
                folder && (
                  <li key={path}>
                    <FolderItem folder={folder} onOpenManualMatch={props.onOpenManualMatch} />
                  </li>
                )
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyScanState
          hasOutstandingMatches={props.hasOutstandingMatches}
          isScanning={props.isScanning}
        />
      )}
    </div>
  );
}
