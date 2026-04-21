import {
  CheckIcon,
  FolderIcon,
  SpinnerIcon,
  PauseIcon,
  PlayIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from "@phosphor-icons/react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { AnimeSearchResult, UnmappedFolder } from "~/lib/api";
import { animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { formatFileSize } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";
import { useFolderItemController } from "~/components/scan/folder-item-controller";
import {
  emptyMatchMessage,
  folderMatchHint,
  folderStatusLabel,
  formatConfidencePercent,
} from "~/components/scan/folder-item-utils";

export function FolderItem(props: {
  folder: UnmappedFolder;
  onOpenManualMatch?: (input: {
    folder: UnmappedFolder;
    onSelect: (anime: AnimeSearchResult) => void;
  }) => void;
}) {
  const state = useFolderItemController(props.folder);

  return (
    <div className="grid gap-4 border border-border bg-background p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center border border-info/20 bg-info/10 text-info">
            <FolderIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className="truncate text-sm font-semibold text-foreground"
                title={props.folder.name}
              >
                {props.folder.name}
              </p>
              <Badge variant="outline">{folderStatusLabel(props.folder)}</Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground" title={props.folder.path}>
              {props.folder.path}
            </p>
            <p className="text-xs text-muted-foreground">{folderMatchHint(props.folder)}</p>
            {props.folder.search_queries?.length ? (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Search
                </span>
                {(props.folder.search_queries ?? []).slice(0, 3).map((query) => (
                  <Badge key={query} variant="outline" className="h-5 px-1.5 text-xs">
                    {query}
                  </Badge>
                ))}
              </div>
            ) : null}
            {formatFileSize(props.folder.size) && (
              <p className="text-[11px] text-muted-foreground">
                {formatFileSize(props.folder.size)} on disk
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 border border-border bg-muted p-3">
        {state.selectedAnime ? (
          <div className="flex items-start gap-3">
            {state.selectedAnime.cover_image && (
              <img
                src={state.selectedAnime.cover_image}
                alt={state.selectedAnime.title.romaji}
                className="h-16 w-11 shrink-0 border border-border object-cover"
              />
            )}
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className="truncate text-sm font-semibold text-foreground"
                  title={state.selectedAnime.title.romaji}
                >
                  {animeDisplayTitle(state.selectedAnime)}
                </p>
                {state.selectedAnime.already_in_library && (
                  <Badge variant="secondary">Already in library</Badge>
                )}
                {state.manualMatch && <Badge variant="outline">Manual match</Badge>}
              </div>
              {state.selectedAnime.title.english &&
                state.selectedAnime.title.english !== state.selectedAnime.title.romaji && (
                  <p className="truncate text-xs text-muted-foreground">
                    {state.selectedAnime.title.english}
                  </p>
                )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {state.selectedAnime.format && <span>{state.selectedAnime.format}</span>}
                {state.selectedAnime.episode_count && (
                  <span>{state.selectedAnime.episode_count} episodes</span>
                )}
                {animeSearchSubtitle(state.selectedAnime) && (
                  <span>{animeSearchSubtitle(state.selectedAnime)}</span>
                )}
                {state.selectedAnime.genres?.length ? (
                  <span>{state.selectedAnime.genres?.slice(0, 2).join(" / ")}</span>
                ) : null}
                {state.selectedAnime.match_confidence !== undefined && (
                  <Badge variant="outline" className="h-5 px-1.5 text-xs">
                    {formatConfidencePercent(state.selectedAnime.match_confidence)} match
                  </Badge>
                )}
              </div>
              {state.selectedAnime.match_reason && !state.manualMatch && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {state.selectedAnime.match_reason}
                </p>
              )}
              {state.selectedAnime.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {state.selectedAnime.description}
                </p>
              )}
              {state.selectedAnime.related_anime?.length ? (
                <div className="space-y-1.5">
                  {state.selectedAnime.related_anime?.slice(0, 2).map((related) => (
                    <AnimeDiscoveryRow
                      key={`${related.id ?? "related"}-${animeDisplayTitle(related)}`}
                      entry={related}
                      libraryIds={state.selectedAnimeIds}
                      compact
                    />
                  ))}
                </div>
              ) : null}
              {state.selectedAnime.recommended_anime?.length ? (
                <div className="space-y-1.5">
                  {state.selectedAnime.recommended_anime?.slice(0, 2).map((recommended) => (
                    <AnimeDiscoveryRow
                      key={`${recommended.id ?? "recommended"}-${animeDisplayTitle(recommended)}`}
                      entry={recommended}
                      libraryIds={state.selectedAnimeIds}
                      compact
                    />
                  ))}
                </div>
              ) : null}
              {!state.selectedAnime.already_in_library && (
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Quality profile for the new anime
                  </span>
                  <Select
                    value={state.selectedProfile?.name ?? undefined}
                    onValueChange={(value) => state.setSelectedProfileName(value ?? "")}
                  >
                    <SelectTrigger
                      aria-label="Quality profile for the new anime"
                      className="h-9 bg-background"
                    >
                      <SelectValue placeholder="Select profile..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(state.profilesQuery.data ?? []).map((profile) => (
                        <SelectItem key={profile.name} value={profile.name}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[88px] items-center text-sm text-muted-foreground italic">
            {emptyMatchMessage(props.folder)}
          </div>
        )}
      </div>

      <div className="flex flex-col justify-start gap-2 lg:min-w-[160px]">
        <div role="group" aria-label="Folder actions" className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={
              state.isControlling ||
              props.folder.match_status === "matching" ||
              props.folder.match_status === "paused"
            }
            onClick={() => state.handleControl("pause")}
            className="justify-start"
          >
            <PauseIcon className="mr-2 h-4 w-4" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.isControlling || props.folder.match_status !== "paused"}
            onClick={() => state.handleControl("resume")}
            className="justify-start"
          >
            <PlayIcon className="mr-2 h-4 w-4" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.isControlling || props.folder.match_status === "matching"}
            onClick={() => state.handleControl("refresh")}
            className="justify-start"
          >
            <ArrowClockwiseIcon
              className={cn("mr-2 h-4 w-4", state.isControlling && "animate-spin")}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.isControlling || props.folder.match_status === "matching"}
            onClick={() => state.setResetConfirmOpen(true)}
            className="justify-start"
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>

        <AlertDialog open={state.resetConfirmOpen} onOpenChange={state.setResetConfirmOpen}>
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
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() =>
            props.onOpenManualMatch?.({
              folder: props.folder,
              onSelect: (anime) => {
                state.setManualMatch(anime);
              },
            })
          }
        >
          <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
          Change match
        </Button>

        <Button
          size="sm"
          disabled={!state.selectedAnime || state.isImporting}
          onClick={() => state.handleImport()}
          className="justify-start"
        >
          {state.isImporting ? (
            <>
              <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <CheckIcon className="mr-2 h-4 w-4" />
              {state.importLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
