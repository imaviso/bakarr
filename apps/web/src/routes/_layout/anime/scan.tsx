import {
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-solidjs";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { toast } from "solid-sonner";
import { GeneralError } from "~/components/general-error";
import { BackgroundMatchingCard } from "~/components/scan/background-matching-card";
import { EmptyScanState } from "~/components/scan/empty-scan-state";
import { FolderItem } from "~/components/scan/folder-item";
import { StatChip } from "~/components/scan/stat-chip";
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
  createBulkControlUnmappedFoldersMutation,
  createScanLibraryMutation,
  createSystemJobsQuery,
  createUnmappedFoldersQuery,
  type UnmappedFolder,
  unmappedFoldersQueryOptions,
} from "~/lib/api";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_layout/anime/scan")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(unmappedFoldersQueryOptions());
  },
  component: LibraryScanPage,
  errorComponent: GeneralError,
});

function LibraryScanPage() {
  const scanState = createUnmappedFoldersQuery();
  const systemJobs = createSystemJobsQuery();
  const bulkControlMutation = createBulkControlUnmappedFoldersMutation();
  const scanMutation = createScanLibraryMutation();
  const navigate = useNavigate();
  const [confirmBulkAction, setConfirmBulkAction] = createSignal<
    null | "pause_queued" | "reset_failed"
  >(null);

  const [folders, setFolders] = createStore<UnmappedFolder[]>([]);
  createEffect(() => {
    setFolders(
      reconcile(scanState.data?.folders ?? [], { key: "path", merge: true }),
    );
  });

  const isScanning = () => scanState.data?.is_scanning;
  const hasOutstandingMatches = () => scanState.data?.has_outstanding_matches;
  const unmappedJob = createMemo(() =>
    systemJobs.data?.find((job) => job.name === "unmapped_scan")
  );
  const isWorkerRunning = () => Boolean(unmappedJob()?.is_running);
  const isRescanning = () => scanMutation.isPending || isWorkerRunning();
  const counts = createMemo(() => {
    let exact = 0;
    let queued = 0;
    let matching = 0;
    let matched = 0;
    let failed = 0;
    let paused = 0;
    for (const f of folders) {
      if (f.suggested_matches[0]?.already_in_library) exact++;
      switch (f.match_status) {
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
  });
  const runBulkAction = (
    action:
      | "pause_queued"
      | "resume_paused"
      | "reset_failed"
      | "retry_failed",
  ) => {
    const labels: Record<typeof action, string> = {
      pause_queued: "Pausing queued folders",
      reset_failed: "Resetting failed folders",
      resume_paused: "Starting paused folders",
      retry_failed: "Retrying failed folders",
    };

    toast.promise(bulkControlMutation.mutateAsync({ action }), {
      loading: `${labels[action]}...`,
      success: labels[action],
      error: (err) => `Failed to run bulk action: ${err.message}`,
    });
  };
  const confirmBulkMeta = createMemo(() => {
    const action = confirmBulkAction();

    if (action === "pause_queued") {
      return {
        actionLabel: "Pause queued folders",
        description: `This pauses ${counts().queued} queued ${
          pluralizeFolderCount(counts().queued)
        }. Folders already matching right now will keep running.`,
        title: `Pause ${counts().queued} queued ${
          pluralizeFolderCount(counts().queued)
        }?`,
      };
    }

    if (action === "reset_failed") {
      return {
        actionLabel: "Reset failed folders",
        description:
          `This clears the cached error state and suggestions for ${counts().failed} failed ${
            pluralizeFolderCount(counts().failed)
          }, then queues them for a fresh background match.`,
        title: `Reset ${counts().failed} failed ${
          pluralizeFolderCount(counts().failed)
        }?`,
      };
    }

    return null;
  });

  const confirmBulkActionNow = () => {
    const action = confirmBulkAction();
    if (!action) {
      return;
    }

    runBulkAction(action);
    setConfirmBulkAction(null);
  };

  return (
    <div class="flex h-full min-w-0 flex-col bg-[radial-gradient(circle_at_top_left,hsl(var(--info)/0.12),transparent_34%),radial-gradient(circle_at_top_right,hsl(var(--primary)/0.08),transparent_28%)]">
      <div class="sticky top-0 z-10 shrink-0 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div class="px-6 py-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="space-y-3">
              <div class="inline-flex items-center gap-2 border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
                <IconSparkles class="h-3.5 w-3.5 text-info" />
                Library Scan
              </div>
              <div>
                <h1 class="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  Import folders
                </h1>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                  Map existing folders to anime and import episodes.
                </p>
                <p class="mt-1 max-w-3xl text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                  Background matching checks one folder roughly every 3 seconds.
                </p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 lg:justify-end">
              <StatChip label="Unmapped" value={String(folders.length)} />
              <StatChip
                label="Queued"
                value={String(counts().queued + counts().matching)}
              />
              <StatChip
                label="Paused"
                value={String(counts().paused)}
              />
              <StatChip
                label="Already in library"
                value={String(counts().exact)}
                tone="info"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isRescanning()}
                onClick={() => scanMutation.mutate()}
              >
                <IconRefresh
                  class={cn("mr-2 h-4 w-4", isRescanning() && "animate-spin")}
                />
                {isRescanning() ? "Scanning..." : "Rescan"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkControlMutation.isPending ||
                  counts().queued === 0}
                onClick={() => setConfirmBulkAction("pause_queued")}
              >
                <IconPlayerPause class="mr-2 h-4 w-4" />
                Pause Queued
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkControlMutation.isPending ||
                  counts().paused === 0}
                onClick={() => runBulkAction("resume_paused")}
              >
                <IconPlayerPlay class="mr-2 h-4 w-4" />
                Start Paused
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkControlMutation.isPending ||
                  counts().failed === 0}
                onClick={() => runBulkAction("retry_failed")}
              >
                <IconRefresh class="mr-2 h-4 w-4" />
                Retry Failed
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkControlMutation.isPending ||
                  counts().failed === 0}
                onClick={() => setConfirmBulkAction("reset_failed")}
              >
                <IconTrash class="mr-2 h-4 w-4" />
                Reset Failed
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate({
                    to: "/anime",
                    search: { q: "", filter: "all", view: "grid" },
                  })}
              >
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={confirmBulkAction() !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmBulkAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBulkMeta()?.title ?? ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulkMeta()?.description ?? ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              class={confirmBulkAction() === "reset_failed"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined}
              onClick={confirmBulkActionNow}
            >
              {confirmBulkMeta()?.actionLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div class="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
        <Show
          when={scanState.isLoading}
          fallback={
            <Show
              when={folders.length > 0}
              fallback={
                <EmptyScanState
                  hasOutstandingMatches={Boolean(hasOutstandingMatches())}
                  isScanning={Boolean(isScanning())}
                />
              }
            >
              <div class="space-y-4">
                <Show when={folders.length > 0 || unmappedJob()}>
                  <BackgroundMatchingCard
                    job={unmappedJob()}
                    failedCount={counts().failed}
                    hasOutstandingWork={Boolean(hasOutstandingMatches())}
                    isRunning={isWorkerRunning()}
                    matchedCount={counts().matched}
                    matchingCount={counts().matching}
                    pausedCount={counts().paused}
                    queuedCount={counts().queued}
                    totalCount={folders.length}
                  />
                </Show>
                <ul role="list" class="space-y-3">
                  <For each={folders}>
                    {(folder) => (
                      <li>
                        <FolderItem folder={folder} />
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
          }
        >
          <div class="flex h-full items-center justify-center">
            <IconLoader2 class="h-8 w-8 animate-spin" />
          </div>
        </Show>
      </div>
    </div>
  );
}

function pluralizeFolderCount(count: number) {
  return count === 1 ? "folder" : "folders";
}
