import {
  IconCheck,
  IconFolder,
  IconLoader2,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@tabler/icons-solidjs";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { AnimeDiscoveryRow } from "~/components/anime-discovery";
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
import {
  type AddAnimeRequest,
  type AnimeSearchResult,
  createAddAnimeMutation,
  createControlUnmappedFolderMutation,
  createImportUnmappedFolderMutation,
  createProfilesQuery,
  createScanLibraryMutation,
  type UnmappedFolder,
} from "~/lib/api";
import { animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { formatFileSize } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";
import { runFolderBackgroundMatchAction } from "./background-matching-actions";
import { MAX_AUTO_MATCH_ATTEMPTS } from "./constants";
import { ManualMatchSearch } from "./manual-match-search";

export function FolderItem(props: { folder: UnmappedFolder }) {
  const addAnimeMutation = createAddAnimeMutation();
  const controlMutation = createControlUnmappedFolderMutation();
  const importMutation = createImportUnmappedFolderMutation();
  const scanMutation = createScanLibraryMutation();
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
      runFolderBackgroundMatchAction({
        action,
        control: (data) => controlMutation.mutateAsync(data),
        path: props.folder.path,
        startScan: () => scanMutation.mutateAsync(),
      }),
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
            <Show when={props.folder.search_queries?.length}>
              <div class="flex flex-wrap items-center gap-1 pt-1">
                <span class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                  Search
                </span>
                <For each={(props.folder.search_queries ?? []).slice(0, 3)}>
                  {(query) => (
                    <Badge variant="outline" class="h-5 px-1.5 text-xs">
                      {query}
                    </Badge>
                  )}
                </For>
              </div>
            </Show>
            <Show when={formatFileSize(props.folder.size)}>
              <p class="text-[11px] text-muted-foreground">
                {formatFileSize(props.folder.size)} on disk
              </p>
            </Show>
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
                    {animeDisplayTitle(anime())}
                  </p>
                  <Show when={anime().already_in_library}>
                    <Badge variant="secondary">Already in library</Badge>
                  </Show>
                  <Show when={manualMatch()}>
                    <Badge variant="outline">Manual match</Badge>
                  </Show>
                </div>
                <Show
                  when={anime().title.english &&
                    anime().title.english !== anime().title.romaji}
                >
                  <p class="truncate text-xs text-muted-foreground">
                    {anime().title.english}
                  </p>
                </Show>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Show when={anime().format}>
                    <span>{anime().format}</span>
                  </Show>
                  <Show when={anime().episode_count}>
                    <span>{anime().episode_count} episodes</span>
                  </Show>
                  <Show when={animeSearchSubtitle(anime())}>
                    <span>{animeSearchSubtitle(anime())}</span>
                  </Show>
                  <Show when={anime().genres?.length}>
                    <span>{anime().genres?.slice(0, 2).join(" / ")}</span>
                  </Show>
                  <Show when={anime().match_confidence !== undefined}>
                    <Badge variant="outline" class="h-5 px-1.5 text-xs">
                      {formatConfidencePercent(anime().match_confidence)} match
                    </Badge>
                  </Show>
                </div>
                <Show when={anime().match_reason && !manualMatch()}>
                  <p class="text-[11px] text-muted-foreground line-clamp-2">
                    {anime().match_reason}
                  </p>
                </Show>
                <Show when={anime().description}>
                  <p class="text-[11px] text-muted-foreground line-clamp-2">
                    {anime().description}
                  </p>
                </Show>
                <Show when={anime().related_anime?.length}>
                  <div class="space-y-1.5">
                    <For each={anime().related_anime?.slice(0, 2)}>
                      {(related) => (
                        <AnimeDiscoveryRow
                          entry={related}
                          libraryIds={new Set([anime().id])}
                          compact
                        />
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={anime().recommended_anime?.length}>
                  <div class="space-y-1.5">
                    <For each={anime().recommended_anime?.slice(0, 2)}>
                      {(recommended) => (
                        <AnimeDiscoveryRow
                          entry={recommended}
                          libraryIds={new Set([anime().id])}
                          compact
                        />
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={!anime().already_in_library}>
                  <div class="space-y-2 pt-1">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Quality profile for the new anime
                    </span>
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
                      <SelectTrigger
                        aria-label="Quality profile for the new anime"
                        class="h-9 bg-background"
                      >
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
        <div
          role="group"
          aria-label="Folder actions"
          class="grid grid-cols-2 gap-2"
        >
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
          ? `Last attempt failed: ${folder.last_match_error}. Another background pass is queued.`
          : "The last attempt failed. Another background pass is queued."
        : folder.last_match_error
        ? `Automatic matching stopped after ${MAX_AUTO_MATCH_ATTEMPTS} failed attempts: ${folder.last_match_error}`
        : `Automatic matching stopped after ${MAX_AUTO_MATCH_ATTEMPTS} failed attempts.`;
    case "done":
      return folder.suggested_matches.length > 0
        ? "Automatic suggestions are ready. You can import immediately or change the match."
        : "No automatic match was found in the latest background pass. Search manually to continue.";
    case "pending":
    default:
      return "Queued for the next background match pass. Folders are processed one by one.";
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
      return "Queued for the next background match pass. Search for an anime to import now, or wait for suggestions.";
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

function formatConfidencePercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unknown";
  }

  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}
