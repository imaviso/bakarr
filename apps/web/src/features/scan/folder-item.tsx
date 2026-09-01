import {
  RiCheckLine,
  RiDeleteBinLine,
  RiFolderLine,
  RiLoader4Line,
  RiPauseLine,
  RiPlayLine,
  RiRefreshLine,
  RiSearchLine,
} from "@remixicon/react";
import { memo } from "react";
import { SectionLabel } from "@/components/shared/section-label";
import { MediaDiscoveryRow } from "@/features/media/media-discovery";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaSearchResult, UnmappedFolder } from "@/api/contracts";
import { animeDisplayTitle, animeSearchSubtitle } from "@/domain/media/metadata";
import { mediaKindLabel, mediaUnitShortLabel } from "@/domain/media-unit";
import { formatFileSize } from "@/domain/scanned-file";
import { cn } from "@/infra/utils";
import { useFolderItemController } from "@/features/scan/folder-item-controller";
import {
  emptyMatchMessage,
  folderMatchHint,
  folderStatusLabel,
  formatConfidencePercent,
} from "@/features/scan/folder-item-utils";

// Memoized to avoid re-render of off-screen folders during virtual scrolling.
// Parent must keep `folder` object stable (or use key-based identity) for memo to be effective.
export const FolderItem = memo(function FolderItem(props: {
  folder: UnmappedFolder;
  onOpenManualMatch?: (input: {
    folder: UnmappedFolder;
    onSelect: (anime: MediaSearchResult) => void;
  }) => void;
}) {
  const state = useFolderItemController(props.folder);

  return (
    <div className="grid gap-4 border border-border bg-background p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center border border-info/20 bg-info/10 text-info">
            <RiFolderLine className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground" title={props.folder.name}>
                {props.folder.name}
              </p>
              {props.folder.media_kind && (
                <Badge variant="secondary">{mediaKindLabel(props.folder.media_kind)}</Badge>
              )}
              <Badge variant="outline">{folderStatusLabel(props.folder)}</Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground" title={props.folder.path}>
              {props.folder.path}
            </p>
            <p className="text-xs text-muted-foreground">{folderMatchHint(props.folder)}</p>
            {props.folder.search_queries?.length ? (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <SectionLabel>Search</SectionLabel>
                {props.folder.search_queries.slice(0, 3).map((query) => (
                  <Badge key={query} variant="outline" className="h-5 px-1.5 text-xs">
                    {query}
                  </Badge>
                ))}
              </div>
            ) : null}
            {formatFileSize(props.folder.size) && (
              <p className="text-xs text-muted-foreground">
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
                  className="truncate text-sm font-medium text-foreground"
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
                {state.selectedAnime.unit_count && (
                  <span>
                    {mediaUnitShortLabel(
                      state.selectedAnime.media_kind === "anime" ? "episode" : "volume",
                      state.selectedAnime.unit_count,
                    )}
                  </span>
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
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {state.selectedAnime.match_reason}
                </p>
              )}
              {state.selectedAnime.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {state.selectedAnime.description}
                </p>
              )}
              {state.selectedAnime.related_media?.length ? (
                <div className="space-y-1.5">
                  {state.selectedAnime.related_media?.slice(0, 2).map((related) => (
                    <MediaDiscoveryRow
                      key={`${related.id ?? "related"}-${animeDisplayTitle(related)}`}
                      entry={related}
                      libraryIds={state.selectedAnimeIds}
                      compact
                    />
                  ))}
                </div>
              ) : null}
              {state.selectedAnime.recommended_media?.length ? (
                <div className="space-y-1.5">
                  {state.selectedAnime.recommended_media?.slice(0, 2).map((recommended) => (
                    <MediaDiscoveryRow
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
                  <SectionLabel>Quality profile for the new media</SectionLabel>
                  <Select
                    selectedKey={state.selectedProfile?.name ?? null}
                    onSelectionChange={(value) => {
                      if (value !== null) {
                        state.setSelectedProfileName(String(value));
                      }
                    }}
                  >
                    <SelectTrigger
                      aria-label="Quality profile for the new media"
                      className="h-9 bg-background"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(state.profilesQuery.data ?? []).map((profile) => (
                        <SelectItem key={profile.name} id={profile.name} textValue={profile.name}>
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
            isDisabled={
              state.isControlling ||
              props.folder.match_status === "matching" ||
              props.folder.match_status === "paused"
            }
            onPress={() => state.handleControl("pause")}
            className="justify-start"
          >
            <RiPauseLine className="mr-2 h-4 w-4" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            isDisabled={state.isControlling || props.folder.match_status !== "paused"}
            onPress={() => state.handleControl("resume")}
            className="justify-start"
          >
            <RiPlayLine className="mr-2 h-4 w-4" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            isDisabled={state.isControlling || props.folder.match_status === "matching"}
            onPress={() => state.handleControl("refresh")}
            className="justify-start"
          >
            <RiRefreshLine className={cn("mr-2 h-4 w-4", state.isControlling && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            isDisabled={state.isControlling || props.folder.match_status === "matching"}
            onPress={() => state.setResetConfirmOpen(true)}
            className="justify-start"
          >
            <RiDeleteBinLine className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>

        <ConfirmDialog
          title={`Reset match for ${props.folder.name}?`}
          description="This clears the cached error state and suggested matches for this folder, then queues it for a fresh background match."
          confirmLabel="Reset match"
          destructive
          isOpen={state.resetConfirmOpen}
          onOpenChange={state.setResetConfirmOpen}
          onConfirm={() => {
            state.handleControl("reset");
            state.setResetConfirmOpen(false);
          }}
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start"
          onPress={() =>
            props.onOpenManualMatch?.({
              folder: props.folder,
              onSelect: (anime) => {
                state.setManualMatch(anime);
              },
            })
          }
        >
          <RiSearchLine className="mr-2 h-4 w-4" />
          Change match
        </Button>

        <Button
          size="sm"
          isDisabled={!state.selectedAnime || state.isImporting}
          onPress={() => state.handleImport()}
          className="justify-start"
        >
          {state.isImporting ? (
            <>
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <RiCheckLine className="mr-2 h-4 w-4" />
              {state.importLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
});
