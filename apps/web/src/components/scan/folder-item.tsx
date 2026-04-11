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
import { For, Show } from "solid-js";
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
import type { UnmappedFolder } from "~/lib/api";
import { animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { formatFileSize } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";
import { createFolderItemController } from "~/components/scan/folder-item-controller";
import {
  emptyMatchMessage,
  folderMatchHint,
  folderStatusLabel,
  formatConfidencePercent,
} from "~/components/scan/folder-item-utils";
import { ManualMatchSearch } from "./manual-match-search";

export function FolderItem(props: { folder: UnmappedFolder }) {
  const state = createFolderItemController(() => props.folder);

  return (
    <div class="grid gap-4 border border-border/70 bg-background/85 p-4 shadow-sm lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-start">
      <div class="min-w-0">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center border border-info/20 bg-info/10 text-info">
            <IconFolder class="h-5 w-5" />
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-semibold text-foreground" title={props.folder.name}>
                {props.folder.name}
              </p>
              <Badge variant="outline">{folderStatusLabel(props.folder)}</Badge>
            </div>
            <p class="truncate text-xs text-muted-foreground" title={props.folder.path}>
              {props.folder.path}
            </p>
            <p class="text-xs text-muted-foreground">{folderMatchHint(props.folder)}</p>
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
          when={state.selectedAnime()}
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
                  <Show when={state.manualMatch()}>
                    <Badge variant="outline">Manual match</Badge>
                  </Show>
                </div>
                <Show
                  when={anime().title.english && anime().title.english !== anime().title.romaji}
                >
                  <p class="truncate text-xs text-muted-foreground">{anime().title.english}</p>
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
                <Show when={anime().match_reason && !state.manualMatch()}>
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
                          libraryIds={state.selectedAnimeIds()}
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
                          libraryIds={state.selectedAnimeIds()}
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
                      value={state.selectedProfile()?.name ?? null}
                      onChange={(value) => value && state.setSelectedProfileName(value)}
                      options={(state.profilesQuery.data ?? []).map((profile) => profile.name)}
                      placeholder="Select profile..."
                      itemComponent={(itemProps) => (
                        <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
                      )}
                    >
                      <SelectTrigger
                        aria-label="Quality profile for the new anime"
                        class="h-9 bg-background"
                      >
                        <SelectValue<string>>{(state) => state.selectedOption()}</SelectValue>
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
        <div role="group" aria-label="Folder actions" class="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={
              state.isControlling() ||
              props.folder.match_status === "matching" ||
              props.folder.match_status === "paused"
            }
            onClick={() => state.handleControl("pause")}
            class="justify-start"
          >
            <IconPlayerPause class="mr-2 h-4 w-4" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.isControlling() || props.folder.match_status !== "paused"}
            onClick={() => state.handleControl("resume")}
            class="justify-start"
          >
            <IconPlayerPlay class="mr-2 h-4 w-4" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.isControlling() || props.folder.match_status === "matching"}
            onClick={() => state.handleControl("refresh")}
            class="justify-start"
          >
            <IconRefresh class={cn("mr-2 h-4 w-4", state.isControlling() && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.isControlling() || props.folder.match_status === "matching"}
            onClick={() => state.setResetConfirmOpen(true)}
            class="justify-start"
          >
            <IconTrash class="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>

        <AlertDialog open={state.resetConfirmOpen()} onOpenChange={state.setResetConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset match for {props.folder.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears the cached error state and suggested matches for this folder, then
                queues it for a fresh background match.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  state.handleControl("reset");
                  state.setResetConfirmOpen(false);
                }}
              >
                Reset match
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={state.manualDialogOpen()} onOpenChange={state.setManualDialogOpen}>
          <DialogTrigger as={Button} type="button" variant="ghost" size="sm" class="justify-start">
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
                state.setManualMatch(anime);
                state.setManualDialogOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>

        <Button
          size="sm"
          disabled={!state.selectedAnime() || state.isImporting()}
          onClick={() => void state.handleImport()}
          class="justify-start"
        >
          <Show
            when={state.isImporting()}
            fallback={
              <>
                <IconCheck class="mr-2 h-4 w-4" />
                {state.importLabel()}
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
