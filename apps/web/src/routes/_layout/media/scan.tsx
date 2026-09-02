import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GeneralError } from "@/components/shared/general-error";
import { PageShell } from "@/app/layout/page-shell";
import { runBulkBackgroundMatchAction } from "@/features/scan/background-matching-actions";
import { isBackgroundMatchingRunning } from "@/features/scan/background-matching-state";
import { ScanContent } from "@/features/scan/sections/scan-content";
import { ScanDialogs } from "@/features/scan/sections/scan-dialogs";
import { ScanPageHeader } from "@/features/scan/sections/scan-page-header";
import {
  useBulkControlUnmappedFoldersMutation,
  useScanLibraryMutation,
  unmappedFoldersQueryOptions,
} from "@/api/system-library";
import { systemJobsQueryOptions } from "@/api/system-config";
import type { MediaSearchResult, UnmappedFolder } from "@/api/contracts";
import { usePageTitle } from "@/app/page-title";

export const Route = createFileRoute("/_layout/media/scan")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(unmappedFoldersQueryOptions()),
      queryClient.ensureQueryData(systemJobsQueryOptions()),
    ]);
  },
  component: LibraryScanPage,
  errorComponent: GeneralError,
});

function LibraryScanPage() {
  usePageTitle("Library Scan");
  const scanState = useSuspenseQuery(unmappedFoldersQueryOptions()).data;
  const systemJobs = useSuspenseQuery(systemJobsQueryOptions()).data;
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
  const foldersByPath = useMemo(
    () => new Map(folderList.map((folder) => [folder.path, folder])),
    [folderList],
  );
  const folderPaths = useMemo(() => [...foldersByPath.keys()], [foldersByPath]);

  const isScanning = scanState.is_scanning;
  const hasOutstandingMatches = scanState.has_outstanding_matches;
  const matchStatus = scanState.match_status;

  const serverCounts = scanState.match_counts;
  const counts = serverCounts ?? computeMatchCounts(folders);

  const unmappedJob = systemJobs.find((job) => job.name === "unmapped_scan");
  const isWorkerRunning = isBackgroundMatchingRunning({
    failedCount: counts.failed,
    hasOutstandingWork: hasOutstandingMatches,
    job: unmappedJob,
    matchingCount: counts.matching,
    pausedCount: counts.paused,
    status: matchStatus,
  });
  const isRescanning = scanMutation.isPending || isWorkerRunning;
  const runBulkAction = (
    action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed",
  ) => {
    void runBulkBackgroundMatchAction({
      action,
      control: (data) => bulkControlMutation.mutateAsync(data),
      startScan: () => scanMutation.mutateAsync(),
    });
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
        unmappedJob={unmappedJob}
        counts={counts}
        hasOutstandingMatches={hasOutstandingMatches}
        isWorkerRunning={isWorkerRunning}
        isScanning={isScanning}
        matchStatus={matchStatus}
        folderPaths={folderPaths}
        foldersByPath={foldersByPath}
        onOpenManualMatch={(dialogState) => setManualMatchDialog(dialogState)}
      />
    </PageShell>
  );
}

function computeMatchCounts(folders: readonly UnmappedFolder[]) {
  let exact = 0;
  let queued = 0;
  let matching = 0;
  let matched = 0;
  let failed = 0;
  let paused = 0;
  for (const folder of folders) {
    if (folder.suggested_matches[0]?.already_in_library) exact++;
    switch (folder.match_status) {
      case "pending":
        queued++;
        break;
      case "matching":
        matching++;
        break;
      case "done":
        matched++;
        break;
      case "failed":
        failed++;
        break;
      case "paused":
        paused++;
        break;
    }
  }
  return { exact, queued, matching, matched, failed, paused };
}

function pluralizeFolderCount(count: number) {
  return count === 1 ? "folder" : "folders";
}
