import {
  PauseIcon,
  PlayIcon,
  ArrowClockwiseIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GeneralError } from "~/components/shared/general-error";
import { PageShell } from "~/app/layout/page-shell";
import { BackgroundMatchingCard } from "~/features/scan/background-matching-card";
import { runBulkBackgroundMatchAction } from "~/features/scan/background-matching-actions";
import { isBackgroundMatchingRunning } from "~/features/scan/background-matching-state";
import { EmptyScanState } from "~/features/scan/empty-scan-state";
import { FolderItem } from "~/features/scan/folder-item";
import { ManualMatchSearch } from "~/features/scan/manual-match-search";
import { StatChip } from "~/features/scan/stat-chip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  useBulkControlUnmappedFoldersMutation,
  useScanLibraryMutation,
  unmappedFoldersQueryOptions,
} from "~/api/system-library";
import { systemJobsQueryOptions } from "~/api/system-config";
import type {
  MediaSearchResult,
  BackgroundJobStatus,
  ScannerMatchStatus,
  UnmappedFolder,
} from "~/api/contracts";
import { usePageTitle } from "~/domain/page-title";
import { cn } from "~/infra/utils";

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
  const foldersByPath = new Map(folderList.map((folder) => [folder.path, folder]));

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
        folderPaths={[...foldersByPath.keys()]}
        foldersByPath={foldersByPath}
        onOpenManualMatch={(dialogState) => setManualMatchDialog(dialogState)}
      />
    </PageShell>
  );
}

interface ScanPageHeaderProps {
  foldersCount: number;
  counts: {
    exact: number;
    queued: number;
    matching: number;
    matched: number;
    failed: number;
    paused: number;
  };
  isRescanning: boolean;
  bulkControlPending: boolean;
  onRescan: () => void;
  onPauseQueued: () => void;
  onResumePaused: () => void;
  onRetryFailed: () => void;
  onResetFailed: () => void;
  onBack: () => void;
}

function ScanPageHeader(props: ScanPageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 shrink-0 border-b bg-background">
      <div className="px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 border border-border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              <SparkleIcon className="h-3.5 w-3.5 text-info" />
              Library Scan
            </div>
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-foreground md:text-3xl">
                Import folders
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                Map existing folders to anime and import episodes.
              </p>
              <p className="mt-1 max-w-3xl text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Start a background pass to work through queued folders one by one. It stops
                automatically when the queue is empty.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <StatChip label="Unmapped" value={String(props.foldersCount)} />
            <StatChip label="Queued" value={String(props.counts.queued + props.counts.matching)} />
            <StatChip label="Paused" value={String(props.counts.paused)} />
            <StatChip label="Already in library" value={String(props.counts.exact)} tone="info" />
            <Button
              variant="outline"
              size="sm"
              disabled={props.isRescanning}
              onClick={props.onRescan}
            >
              <ArrowClockwiseIcon
                className={cn("mr-2 h-4 w-4", props.isRescanning && "animate-spin")}
              />
              {props.isRescanning ? "Scanning..." : "Rescan"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={props.bulkControlPending || props.counts.queued === 0}
              onClick={props.onPauseQueued}
            >
              <PauseIcon className="mr-2 h-4 w-4" />
              Pause Queued
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={props.bulkControlPending || props.counts.paused === 0}
              onClick={props.onResumePaused}
            >
              <PlayIcon className="mr-2 h-4 w-4" />
              Start Paused
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={props.bulkControlPending || props.counts.failed === 0}
              onClick={props.onRetryFailed}
            >
              <ArrowClockwiseIcon className="mr-2 h-4 w-4" />
              Retry Failed
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={props.bulkControlPending || props.counts.failed === 0}
              onClick={props.onResetFailed}
            >
              <TrashIcon className="mr-2 h-4 w-4" />
              Reset Failed
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onBack}>
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ScanDialogsProps {
  confirmBulkAction: string | null;
  confirmBulkMeta: {
    actionLabel: string;
    description: string;
    title: string;
  } | null;
  onConfirmBulkAction: () => void;
  onCancelBulkAction: () => void;
  manualMatchDialog: {
    folder: UnmappedFolder;
    onSelect: (anime: MediaSearchResult) => void;
  } | null;
  onCloseManualMatch: () => void;
  onManualMatchSelect: (anime: MediaSearchResult) => void;
}

function ScanDialogs(props: ScanDialogsProps) {
  return (
    <>
      <AlertDialog
        open={props.confirmBulkAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            props.onCancelBulkAction();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{props.confirmBulkMeta?.title ?? ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {props.confirmBulkMeta?.description ?? ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                props.confirmBulkAction === "reset_failed"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={props.onConfirmBulkAction}
            >
              {props.confirmBulkMeta?.actionLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={props.manualMatchDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            props.onCloseManualMatch();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Match folder to anime</DialogTitle>
            <DialogDescription>
              Search for the anime to associate with{" "}
              <span className="font-mono text-xs">
                {props.manualMatchDialog?.folder.name ?? ""}
              </span>
            </DialogDescription>
          </DialogHeader>
          <ManualMatchSearch onSelect={props.onManualMatchSelect} />
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ScanContentProps {
  foldersLength: number;
  unmappedJob: BackgroundJobStatus | undefined;
  counts: {
    exact: number;
    queued: number;
    matching: number;
    matched: number;
    failed: number;
    paused: number;
  };
  hasOutstandingMatches: boolean;
  isWorkerRunning: boolean;
  isScanning: boolean;
  matchStatus: ScannerMatchStatus | undefined;
  folderPaths: readonly string[];
  foldersByPath: Map<string, UnmappedFolder>;
  onOpenManualMatch: (dialogState: {
    folder: UnmappedFolder;
    onSelect: (anime: MediaSearchResult) => void;
  }) => void;
}

function ScanContent(props: ScanContentProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-6">
      {props.foldersLength > 0 ? (
        <div className="space-y-4">
          {(props.foldersLength > 0 || props.unmappedJob) && (
            <BackgroundMatchingCard
              job={props.unmappedJob}
              failedCount={props.counts.failed}
              hasOutstandingWork={props.hasOutstandingMatches}
              isRunning={props.isWorkerRunning}
              status={props.matchStatus}
              matchedCount={props.counts.matched}
              matchingCount={props.counts.matching}
              pausedCount={props.counts.paused}
              queuedCount={props.counts.queued}
              totalCount={props.foldersLength}
            />
          )}
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
