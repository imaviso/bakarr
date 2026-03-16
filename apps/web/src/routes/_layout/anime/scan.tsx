import {
  IconAlertTriangle,
  IconCheck,
  IconFolder,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-solidjs";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { toast } from "solid-sonner";
import { GeneralError } from "~/components/general-error";
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import {
  type AddAnimeRequest,
  type AnimeSearchResult,
  type BackgroundJobStatus,
  createAddAnimeMutation,
  createAnimeSearchQuery,
  createBulkControlUnmappedFoldersMutation,
  createControlUnmappedFolderMutation,
  createImportUnmappedFolderMutation,
  createProfilesQuery,
  createScanLibraryMutation,
  createSystemJobsQuery,
  createUnmappedFoldersQuery,
  type UnmappedFolder,
  unmappedFoldersQueryOptions,
} from "~/lib/api";
import { createDebouncer } from "~/lib/debounce";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_layout/anime/scan")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(unmappedFoldersQueryOptions());
  },
  component: LibraryScanPage,
  errorComponent: GeneralError,
});

const MAX_AUTO_MATCH_ATTEMPTS = 3;

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
  const exactMatches = () =>
    folders.filter((folder) => folder.suggested_matches[0]?.already_in_library)
      .length;
  const queuedCount = () =>
    folders.filter((folder) => folder.match_status === "pending").length;
  const matchingCount = () =>
    folders.filter((folder) => folder.match_status === "matching").length;
  const matchedCount = () =>
    folders.filter((folder) => folder.match_status === "done").length;
  const failedCount = () =>
    folders.filter((folder) => folder.match_status === "failed").length;
  const pausedCount = () =>
    folders.filter((folder) => folder.match_status === "paused").length;
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
        description: `This pauses ${queuedCount()} queued ${
          pluralizeFolderCount(queuedCount())
        }. Folders already matching right now will keep running.`,
        title: `Pause ${queuedCount()} queued ${
          pluralizeFolderCount(queuedCount())
        }?`,
      };
    }

    if (action === "reset_failed") {
      return {
        actionLabel: "Reset failed folders",
        description:
          `This clears the cached error state and suggestions for ${failedCount()} failed ${
            pluralizeFolderCount(failedCount())
          }, then queues them for a fresh background match.`,
        title: `Reset ${failedCount()} failed ${
          pluralizeFolderCount(failedCount())
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
                value={String(queuedCount() + matchingCount())}
              />
              <StatChip
                label="Paused"
                value={String(pausedCount())}
              />
              <StatChip
                label="Already in library"
                value={String(exactMatches())}
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
                disabled={bulkControlMutation.isPending || queuedCount() === 0}
                onClick={() => setConfirmBulkAction("pause_queued")}
              >
                <IconPlayerPause class="mr-2 h-4 w-4" />
                Pause Queued
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkControlMutation.isPending || pausedCount() === 0}
                onClick={() => runBulkAction("resume_paused")}
              >
                <IconPlayerPlay class="mr-2 h-4 w-4" />
                Start Paused
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkControlMutation.isPending || failedCount() === 0}
                onClick={() => runBulkAction("retry_failed")}
              >
                <IconRefresh class="mr-2 h-4 w-4" />
                Retry Failed
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkControlMutation.isPending || failedCount() === 0}
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
                    failedCount={failedCount()}
                    hasOutstandingWork={Boolean(hasOutstandingMatches())}
                    isRunning={isWorkerRunning()}
                    matchedCount={matchedCount()}
                    matchingCount={matchingCount()}
                    pausedCount={pausedCount()}
                    queuedCount={queuedCount()}
                    totalCount={folders.length}
                  />
                </Show>
                <div class="space-y-3">
                  <For each={folders}>
                    {(folder) => <FolderItem folder={folder} />}
                  </For>
                </div>
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

function EmptyScanState(props: {
  hasOutstandingMatches: boolean;
  isScanning: boolean;
}) {
  return (
    <div class="flex min-h-[50vh] flex-col items-center justify-center border border-dashed border-border/70 bg-background/60 px-6 text-center shadow-sm">
      <div class="flex h-16 w-16 items-center justify-center border border-info/20 bg-info/10">
        <IconFolder class="h-8 w-8 text-info" />
      </div>
      <p class="mt-5 text-base font-medium text-foreground">
        <Show
          when={props.isScanning || props.hasOutstandingMatches}
          fallback="No unmapped folders found"
        >
          Scanning for folders...
        </Show>
      </p>
      <p class="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        <Show
          when={props.isScanning || props.hasOutstandingMatches}
          fallback="Everything under your library root is already mapped to anime entries."
        >
          We&apos;re checking your library root for folders that are not linked
          yet, then matching them in the background one by one.
        </Show>
      </p>
    </div>
  );
}

function BackgroundMatchingCard(props: {
  failedCount: number;
  hasOutstandingWork: boolean;
  job?: BackgroundJobStatus;
  isRunning: boolean;
  matchedCount: number;
  matchingCount: number;
  pausedCount: number;
  queuedCount: number;
  totalCount: number;
}) {
  const progressCurrent = createMemo(() => {
    const current = props.job?.progress_current;
    if (typeof current === "number") {
      return current;
    }

    return props.matchedCount;
  });
  const progressTotal = createMemo(() => {
    const total = props.job?.progress_total;
    if (typeof total === "number") {
      return total;
    }

    return props.totalCount;
  });
  const progressPercent = createMemo(() => {
    const total = progressTotal();
    if (!total) {
      return 0;
    }

    return Math.min(100, Math.round((progressCurrent() / total) * 100));
  });

  return (
    <div class="border border-border/70 bg-background/80 p-4 shadow-sm">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold text-foreground">
              Background folder matching
            </p>
            <Badge
              variant={jobStatusVariant(
                props.job,
                props.isRunning,
                props.hasOutstandingWork,
                props.failedCount,
                props.pausedCount,
              )}
            >
              {jobStatusLabel(
                props.job,
                props.isRunning,
                props.hasOutstandingWork,
                props.failedCount,
                props.pausedCount,
              )}
            </Badge>
          </div>
          <p class="text-sm text-muted-foreground">
            {props.matchingCount > 0
              ? "Matching one folder right now to stay under AniList rate limits."
              : props.queuedCount > 0
              ? "Queued folders will keep matching automatically every few seconds."
              : props.pausedCount > 0
              ? "Some folders are paused. Start them again individually or use Start Paused."
              : props.failedCount > 0 && props.hasOutstandingWork
              ? "Some folders failed their latest automatic match. They will retry in the background, or you can choose a manual match now."
              : props.failedCount > 0
              ? `Some folders hit the ${MAX_AUTO_MATCH_ATTEMPTS}-attempt automatic match limit. Choose a manual match to continue.`
              : "All discovered folders have finished their latest background match pass."}
          </p>
          <Show when={props.job?.last_message}>
            <p class="text-xs text-muted-foreground">
              {props.job?.last_message}
            </p>
          </Show>
        </div>

        <div class="grid grid-cols-4 gap-2 text-right text-xs text-muted-foreground lg:min-w-[340px]">
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">Matched</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {props.matchedCount}
            </div>
          </div>
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">In queue</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {props.queuedCount + props.matchingCount}
            </div>
          </div>
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">Paused</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {props.pausedCount}
            </div>
          </div>
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">Total</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {props.totalCount}
            </div>
          </div>
        </div>
      </div>

      <Show when={progressTotal() > 0}>
        <div class="mt-4 space-y-2">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Progress {progressCurrent()} / {progressTotal()}
            </span>
            <span>{progressPercent()}%</span>
          </div>
          <div class="h-2 overflow-hidden bg-muted">
            <div
              class="h-full bg-info transition-[width] duration-500"
              style={{ width: `${progressPercent()}%` }}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}

function jobStatusLabel(
  job: BackgroundJobStatus | undefined,
  isRunning: boolean,
  hasOutstandingWork: boolean,
  failedCount: number,
  pausedCount: number,
) {
  if (isRunning) {
    return "Running";
  }

  if (failedCount > 0 && hasOutstandingWork) {
    return "Retrying";
  }

  if (hasOutstandingWork) {
    return "Scheduled";
  }

  if (pausedCount > 0) {
    return "Paused";
  }

  if (job?.last_status === "failed") {
    return "Failed";
  }

  return "Idle";
}

function jobStatusVariant(
  job: BackgroundJobStatus | undefined,
  isRunning: boolean,
  hasOutstandingWork: boolean,
  failedCount: number,
  pausedCount: number,
): "outline" | "warning" | "error" {
  if (isRunning || hasOutstandingWork || pausedCount > 0) {
    return "warning";
  }

  if (failedCount > 0 || job?.last_status === "failed") {
    return "error";
  }

  return "outline";
}

function StatChip(props: {
  label: string;
  value: string;
  tone?: "default" | "info";
}) {
  return (
    <div
      class={cn(
        "min-w-[112px] border px-3 py-2 text-right shadow-sm",
        props.tone === "info"
          ? "border-info/20 bg-info/5"
          : "border-border/70 bg-background/80",
      )}
    >
      <div class="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {props.label}
      </div>
      <div class="text-lg font-semibold text-foreground">{props.value}</div>
    </div>
  );
}

function FolderItem(props: { folder: UnmappedFolder }) {
  const addAnimeMutation = createAddAnimeMutation();
  const controlMutation = createControlUnmappedFolderMutation();
  const importMutation = createImportUnmappedFolderMutation();
  const profilesQuery = createProfilesQuery();
  const [manualMatch, setManualMatch] = createSignal<AnimeSearchResult | null>(
    null,
  );
  const [manualDialogOpen, setManualDialogOpen] = createSignal(false);
  const [resetConfirmOpen, setResetConfirmOpen] = createSignal(false);
  const [selectedProfileName, setSelectedProfileName] = createSignal<string>(
    "",
  );

  const selectedAnime = createMemo(() => {
    const manual = manualMatch();
    if (manual) {
      return manual;
    }

    const suggested = props.folder.suggested_matches[0];
    return suggested ?? null;
  });

  const selectedProfile = createMemo(() => {
    const selectedName = selectedProfileName();
    const profiles = profilesQuery.data ?? [];
    const fallbackName = profiles[0]?.name ?? "";
    const resolvedName = selectedName || fallbackName;

    return profiles.find((profile) => profile.name === resolvedName) ??
      profiles[0];
  });

  createEffect(() => {
    if (!selectedProfileName() && profilesQuery.data?.[0]?.name) {
      setSelectedProfileName(profilesQuery.data[0].name);
    }
  });

  const existingAnime = createMemo(() =>
    selectedAnime()?.already_in_library ? selectedAnime() : null
  );
  const importLabel = createMemo(() =>
    existingAnime() ? "Use existing anime" : "Add and use folder"
  );

  const isImporting = () =>
    addAnimeMutation.isPending || importMutation.isPending;
  const isControlling = () => controlMutation.isPending;

  const handleControl = (action: "pause" | "resume" | "reset" | "refresh") => {
    const labels: Record<typeof action, string> = {
      pause: "Paused automatic matching",
      refresh: "Refreshing match",
      reset: "Reset match state",
      resume: "Resumed automatic matching",
    };

    toast.promise(
      controlMutation.mutateAsync({ action, path: props.folder.path }),
      {
        loading: `${labels[action]}...`,
        success: labels[action],
        error: (err) => `Failed to ${action} folder: ${err.message}`,
      },
    );
  };

  const handleImport = async () => {
    const anime = selectedAnime();
    if (!anime) return;

    try {
      let animeId = anime.id;

      if (!anime.already_in_library) {
        const profileName = selectedProfile()?.name;
        if (!profileName) {
          throw new Error("No quality profile is available yet.");
        }

        const payload: AddAnimeRequest = {
          id: anime.id,
          monitor_and_search: false,
          monitored: true,
          profile_name: profileName,
          release_profile_ids: [],
          root_folder: props.folder.path,
          use_existing_root: true,
        };
        const createdAnime = await addAnimeMutation.mutateAsync(payload);
        animeId = createdAnime.id;
      }

      await importMutation.mutateAsync({
        anime_id: animeId,
        folder_name: props.folder.name,
      });
      const action = anime.already_in_library ? "Linked" : "Added";
      setManualMatch(null);
      toast.success(`${action} ${anime.title.romaji}`);
    } catch (error) {
      const message = error instanceof Error
        ? normalizeApiErrorMessage(error.message)
        : "Failed to import folder";
      toast.error(message);
    }
  };

  return (
    <div class="grid gap-4 border border-border/70 bg-background/85 p-4 shadow-sm lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-start">
      <div class="min-w-0">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center border border-info/20 bg-info/10 text-info">
            <IconFolder class="h-5 w-5" />
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <p
                class="truncate text-sm font-semibold text-foreground"
                title={props.folder.name}
              >
                {props.folder.name}
              </p>
              <Badge variant="outline">{folderStatusLabel(props.folder)}</Badge>
            </div>
            <p
              class="truncate text-xs text-muted-foreground"
              title={props.folder.path}
            >
              {props.folder.path}
            </p>
            <p class="text-xs text-muted-foreground">
              {folderMatchHint(props.folder)}
            </p>
          </div>
        </div>
      </div>

      <div class="min-w-0 border border-border/60 bg-muted/20 p-3">
        <Show
          when={selectedAnime()}
          fallback={
            <div class="flex min-h-[88px] items-center text-sm text-muted-foreground italic">
              {emptyMatchMessage(props.folder)}
            </div>
          }
        >
          {(anime) => (
            <div class="flex items-start gap-3">
              <Show when={anime().cover_image}>
                <img
                  src={anime().cover_image}
                  alt={anime().title.romaji}
                  class="h-16 w-11 shrink-0 border border-border/60 object-cover"
                />
              </Show>
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <p
                    class="truncate text-sm font-semibold text-foreground"
                    title={anime().title.romaji}
                  >
                    {anime().title.romaji}
                  </p>
                  <Show when={anime().already_in_library}>
                    <Badge variant="secondary">Already in library</Badge>
                  </Show>
                  <Show when={manualMatch()}>
                    <Badge variant="outline">Manual match</Badge>
                  </Show>
                </div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Show when={anime().format}>
                    <span>{anime().format}</span>
                  </Show>
                  <Show when={anime().episode_count}>
                    <span>{anime().episode_count} episodes</span>
                  </Show>
                </div>
                <Show when={!anime().already_in_library}>
                  <div class="space-y-2 pt-1">
                    <label class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Quality profile for the new anime
                    </label>
                    <Select
                      value={selectedProfile()?.name ?? null}
                      onChange={(value) =>
                        value && setSelectedProfileName(value)}
                      options={(profilesQuery.data ?? []).map((profile) =>
                        profile.name
                      )}
                      placeholder="Select profile..."
                      itemComponent={(itemProps) => (
                        <SelectItem item={itemProps.item}>
                          {itemProps.item.rawValue}
                        </SelectItem>
                      )}
                    >
                      <SelectTrigger class="h-9 bg-background">
                        <SelectValue<string>>
                          {(state) => state.selectedOption()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent />
                    </Select>
                  </div>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </div>

      <div class="flex flex-col justify-start gap-2 lg:min-w-[160px]">
        <div class="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isControlling() ||
              props.folder.match_status === "matching" ||
              props.folder.match_status === "paused"}
            onClick={() => handleControl("pause")}
            class="justify-start"
          >
            <IconPlayerPause class="mr-2 h-4 w-4" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isControlling() ||
              props.folder.match_status === "matching" ||
              props.folder.match_status !== "paused"}
            onClick={() => handleControl("resume")}
            class="justify-start"
          >
            <IconPlayerPlay class="mr-2 h-4 w-4" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isControlling() ||
              props.folder.match_status === "matching"}
            onClick={() => handleControl("refresh")}
            class="justify-start"
          >
            <IconRefresh
              class={cn("mr-2 h-4 w-4", isControlling() && "animate-spin")}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isControlling() ||
              props.folder.match_status === "matching"}
            onClick={() => setResetConfirmOpen(true)}
            class="justify-start"
          >
            <IconTrash class="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>

        <AlertDialog
          open={resetConfirmOpen()}
          onOpenChange={setResetConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Reset match for {props.folder.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This clears the cached error state and suggested matches for
                this folder, then queues it for a fresh background match.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  handleControl("reset");
                  setResetConfirmOpen(false);
                }}
              >
                Reset match
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={manualDialogOpen()} onOpenChange={setManualDialogOpen}>
          <DialogTrigger
            as={Button}
            variant="ghost"
            size="sm"
            class="justify-start"
          >
            <IconSearch class="mr-2 h-4 w-4" />
            Change match
          </DialogTrigger>
          <DialogContent class="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Match folder to anime</DialogTitle>
              <DialogDescription>
                Search for the anime to associate with{" "}
                <span class="font-mono text-xs">{props.folder.name}</span>
              </DialogDescription>
            </DialogHeader>
            <ManualMatchSearch
              onSelect={(anime) => {
                setManualMatch(anime);
                setManualDialogOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>

        <Button
          size="sm"
          disabled={!selectedAnime() || isImporting()}
          onClick={() => void handleImport()}
          class="justify-start"
        >
          <Show
            when={isImporting()}
            fallback={
              <>
                <IconCheck class="mr-2 h-4 w-4" />
                {importLabel()}
              </>
            }
          >
            <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
            Importing...
          </Show>
        </Button>
      </div>
    </div>
  );
}

function folderStatusLabel(folder: UnmappedFolder) {
  switch (folder.match_status) {
    case "matching":
      return "Matching";
    case "paused":
      return "Paused";
    case "done":
      return folder.suggested_matches.length > 0 ? "Matched" : "No match";
    case "failed":
      return hasAutomaticRetryRemaining(folder)
        ? "Retrying soon"
        : "Needs review";
    case "pending":
    default:
      return "Queued";
  }
}

function folderMatchHint(folder: UnmappedFolder) {
  switch (folder.match_status) {
    case "matching":
      return "Searching AniList in the background now.";
    case "paused":
      return "Automatic matching is paused for this folder. Start it again or refresh when you are ready.";
    case "failed":
      return hasAutomaticRetryRemaining(folder)
        ? folder.last_match_error
          ? `Last attempt failed: ${folder.last_match_error}. Another automatic retry is queued.`
          : "The last attempt failed. It will retry automatically."
        : folder.last_match_error
        ? `Automatic matching stopped after ${MAX_AUTO_MATCH_ATTEMPTS} failed attempts: ${folder.last_match_error}`
        : `Automatic matching stopped after ${MAX_AUTO_MATCH_ATTEMPTS} failed attempts.`;
    case "done":
      return folder.suggested_matches.length > 0
        ? "Automatic suggestions are ready. You can import immediately or change the match."
        : "No automatic match was found in the latest background pass. Search manually to continue.";
    case "pending":
    default:
      return "Waiting for the background matcher. Folders are processed one by one.";
  }
}

function emptyMatchMessage(folder: UnmappedFolder) {
  switch (folder.match_status) {
    case "matching":
      return "Matching in background...";
    case "paused":
      return "Automatic matching is paused for this folder.";
    case "failed":
      return hasAutomaticRetryRemaining(folder)
        ? "Automatic match failed for now. Another retry is queued."
        : "Automatic matching is paused. Search for an anime to import.";
    case "pending":
      return "Queued for background matching. Search for an anime to import now, or wait for suggestions.";
    case "done":
    default:
      return "No automatic match yet. Search for an anime to import.";
  }
}

function hasAutomaticRetryRemaining(folder: UnmappedFolder) {
  return folder.match_status === "failed" &&
    (folder.match_attempts ?? 0) < MAX_AUTO_MATCH_ATTEMPTS;
}

function normalizeApiErrorMessage(message: string) {
  const trimmed = message.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: string;
        message?: string;
      };
      return parsed.error ?? parsed.message ?? trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function ManualMatchSearch(props: {
  onSelect: (anime: AnimeSearchResult) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const debouncer = createDebouncer(setDebouncedQuery, 500);

  createEffect(() => {
    debouncer.schedule(query());
    onCleanup(() => debouncer.cancel());
  });

  const search = createAnimeSearchQuery(() => debouncedQuery());

  return (
    <div class="space-y-4">
      <div class="relative">
        <IconSearch class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <TextField value={query()} onChange={setQuery}>
          <TextFieldInput
            placeholder="Search anime title..."
            class="pl-9"
            autofocus
          />
        </TextField>
        <Show when={search.isFetching}>
          <IconLoader2 class="absolute right-3 top-3 h-3 w-3 animate-spin text-muted-foreground" />
        </Show>
      </div>

      <div class="h-[320px] overflow-y-auto border border-border/70 bg-background">
        <Show
          when={debouncedQuery()}
          fallback={
            <div class="flex h-full flex-col items-center justify-center text-muted-foreground">
              <IconSearch class="mb-2 h-8 w-8 opacity-20" />
              <p class="text-sm">Type at least 3 characters to search</p>
            </div>
          }
        >
          <Show
            when={search.data?.length !== 0}
            fallback={
              <div class="flex h-full flex-col items-center justify-center text-muted-foreground">
                <IconAlertTriangle class="mb-2 h-8 w-8 opacity-20" />
                <p class="text-sm">No results found</p>
              </div>
            }
          >
            <div class="divide-y divide-border/70">
              <For each={search.data}>
                {(anime) => (
                  <button
                    type="button"
                    onClick={() => props.onSelect(anime)}
                    class="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div class="h-12 w-9 shrink-0 overflow-hidden border border-border/60 bg-muted">
                      <Show when={anime.cover_image}>
                        <img
                          src={anime.cover_image}
                          alt={anime.title.romaji}
                          class="h-full w-full object-cover"
                        />
                      </Show>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-foreground">
                        {anime.title.romaji}
                      </p>
                      <p class="truncate text-xs text-muted-foreground">
                        {anime.title.english}
                      </p>
                    </div>
                    <Show when={anime.already_in_library}>
                      <Badge variant="secondary">In library</Badge>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
