import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GeneralError } from "@/components/shared/general-error";
import { PageShell } from "@/components/shared/page-shell";
import { ScanContent } from "@/features/scan/sections/scan-content";
import { ScanDialogs } from "@/features/scan/sections/scan-dialogs";
import { ScanPageHeader } from "@/features/scan/sections/scan-page-header";
import {
  useBulkControlUnmappedFoldersMutation,
  useScanLibraryMutation,
  unmappedFoldersQueryOptions,
} from "@/api/system-library";
import type { MediaSearchResult, UnmappedFolder } from "@/api/contracts";
import { usePageTitle } from "@/hooks/use-page-title";

export const Route = createFileRoute("/_layout/media/scan")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(unmappedFoldersQueryOptions());
  },
  component: LibraryScanPage,
  errorComponent: GeneralError,
});

function LibraryScanPage() {
  usePageTitle("Library Scan");
  const scanState = useSuspenseQuery(unmappedFoldersQueryOptions()).data;
  const bulkControlMutation = useBulkControlUnmappedFoldersMutation();
  const scanMutation = useScanLibraryMutation();
  const navigate = useNavigate();
  const [confirmBulkAction, setConfirmBulkAction] = useState<
    null | "pause_queued" | "reset_failed"
  >(null);
  const [manualMatchDialog, setManualMatchDialog] = useState<{
    folder: UnmappedFolder;
    onSelect: (anime: MediaSearchResult) => void;
  } | null>(null);

  const folders = scanState.folders;
  const folderList = folders;
  const foldersByPath = new Map(folderList.map((folder) => [folder.path, folder]));
  const folderPaths = [...foldersByPath.keys()];

  const isScanning = scanState.is_scanning;
  const hasOutstandingMatches = scanState.has_outstanding_matches;
  const matchStatus = scanState.match_status;

  const counts = scanState.match_counts;

  const isWorkerRunning = scanState.match_status === "running";
  const isRescanning = scanMutation.isPending || isWorkerRunning;
  // Server owns the follow-up: bulk actions trigger their own scan pass.
  const runBulkAction = (
    action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed",
  ) => {
    bulkControlMutation.mutate({ action });
  };

  const confirmBulkMeta = (() => {
    const action = confirmBulkAction;
    if (action === "pause_queued") {
      return {
        actionLabel: "Pause queued folders",
        description: `This pauses ${counts.queued} queued ${pluralizeFolderCount(
          counts.queued,
        )}. Folders already matching right now will keep running.`,
        title: `Pause ${counts.queued} queued ${pluralizeFolderCount(counts.queued)}?`,
      };
    }
    if (action === "reset_failed") {
      return {
        actionLabel: "Reset failed folders",
        description: `This clears the cached error state and suggestions for ${counts.failed} failed ${pluralizeFolderCount(
          counts.failed,
        )}, then queues them for a fresh background match.`,
        title: `Reset ${counts.failed} failed ${pluralizeFolderCount(counts.failed)}?`,
      };
    }
    return null;
  })();

  const confirmBulkActionNow = () => {
    const action = confirmBulkAction;
    if (!action) {
      return;
    }

    runBulkAction(action);
    setConfirmBulkAction(null);
  };

  return (
    <PageShell scroll="inner" className="gap-0">
      <ScanPageHeader
        foldersCount={folderList.length}
        counts={counts}
        isRescanning={isRescanning}
        bulkControlPending={bulkControlMutation.isPending}
        onRescan={() => scanMutation.mutate()}
        onPauseQueued={() => setConfirmBulkAction("pause_queued")}
        onResumePaused={() => runBulkAction("resume_paused")}
        onRetryFailed={() => runBulkAction("retry_failed")}
        onResetFailed={() => setConfirmBulkAction("reset_failed")}
        onBack={() =>
          navigate({
            to: "/media",
            search: { q: "", filter: "all", view: "grid" },
          })
        }
      />

      <ScanDialogs
        confirmBulkAction={confirmBulkAction}
        confirmBulkMeta={confirmBulkMeta}
        onConfirmBulkAction={confirmBulkActionNow}
        onCancelBulkAction={() => setConfirmBulkAction(null)}
        manualMatchDialog={manualMatchDialog}
        onCloseManualMatch={() => setManualMatchDialog(null)}
        onManualMatchSelect={(anime) => {
          manualMatchDialog?.onSelect(anime);
          setManualMatchDialog(null);
        }}
      />

      <ScanContent
        foldersLength={folderList.length}
        counts={counts}
        hasOutstandingMatches={hasOutstandingMatches}
        isScanning={isScanning}
        matchStatus={matchStatus}
        folderPaths={folderPaths}
        foldersByPath={foldersByPath}
        onOpenManualMatch={(dialogState) => setManualMatchDialog(dialogState)}
      />
    </PageShell>
  );
}

function pluralizeFolderCount(count: number) {
  return count === 1 ? "folder" : "folders";
}
