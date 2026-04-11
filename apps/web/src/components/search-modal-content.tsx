import {
  IconAlertTriangle,
  IconDownload,
  IconLoader2,
  IconPlug,
  IconVideo,
} from "@tabler/icons-solidjs";
import { formatDistanceToNow } from "date-fns";
import { For, Show } from "solid-js";
import {
  ReleasePeersCell,
  ReleasePrimaryCell,
} from "~/components/release-search/release-result-cells";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  buildReleaseDisplay,
  buildSelectionDisplayFromDownloadAction,
} from "~/lib/release-display";
import { type EpisodeSearchResult } from "~/lib/api";
import { getReleaseConfidence } from "~/lib/release-selection";
import { actionReasonFromDownloadAction } from "~/lib/release-grab";
import { cn } from "~/lib/utils";
import type { SearchModalState } from "~/components/search-modal-state";

interface SearchModalContentProps {
  episodeNumber: number;
  episodeTitle?: string | undefined;
  state: SearchModalState;
}

export function SearchModalContent(props: SearchModalContentProps) {
  return (
    <DialogContent class="sm:max-w-7xl w-full max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Manual Search</DialogTitle>
        <DialogDescription>
          Searching for Episode {props.episodeNumber}
          <Show when={props.episodeTitle}>- {props.episodeTitle}</Show>
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-hidden min-h-[200px] flex flex-col">
        <Show
          when={!props.state.searchQuery.isLoading}
          fallback={
            <div class="h-full flex flex-col items-center justify-center gap-4 py-8">
              <IconLoader2 class="h-8 w-8 animate-spin text-muted-foreground" />
              <p class="text-muted-foreground">Searching releases...</p>
            </div>
          }
        >
          <Show
            when={!props.state.searchQuery.error}
            fallback={
              <div class="flex flex-col items-center justify-center flex-1 text-error gap-2">
                <IconAlertTriangle class="h-8 w-8" />
                <p>Error searching for releases</p>
                <p class="text-sm text-muted-foreground">
                  {props.state.searchQuery.error instanceof Error
                    ? props.state.searchQuery.error.message
                    : String(props.state.searchQuery.error)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void props.state.searchQuery.refetch();
                  }}
                  class="mt-2"
                >
                  Retry
                </Button>
              </div>
            }
          >
            <Show
              when={props.state.searchQuery.data && props.state.searchQuery.data.length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                  <IconVideo class="h-12 w-12 opacity-20" />
                  <p class="mt-2">No releases found</p>
                </div>
              }
            >
              <div class="flex-1 border rounded-none overflow-auto">
                <Table>
                  <TableHeader class="bg-muted/50 sticky top-0 z-10 shadow-sm">
                    <TableRow>
                      <TableHead>Release</TableHead>
                      <TableHead class="w-[100px]">Indexer</TableHead>
                      <TableHead class="w-[80px]">Size</TableHead>
                      <TableHead class="w-[80px]">Peers</TableHead>
                      <TableHead class="w-[120px]">Profile</TableHead>
                      <TableHead class="w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={props.state.searchQuery.data}>
                      {(release) => (
                        <SearchReleaseRow
                          release={release}
                          onDownload={props.state.handleDownload}
                          isDownloading={props.state.grabRelease.isPending}
                        />
                      )}
                    </For>
                  </TableBody>
                </Table>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </DialogContent>
  );
}

function SearchReleaseRow(props: {
  release: EpisodeSearchResult;
  onDownload: (release: EpisodeSearchResult) => void;
  isDownloading: boolean;
}) {
  const action = props.release.download_action;
  const isRejected = Boolean(action.Reject);
  const reason = actionReasonFromDownloadAction(action);
  const selectionDisplay = buildSelectionDisplayFromDownloadAction(action);
  const releaseDisplay = buildReleaseDisplay({
    group: props.release.group,
    indexer: props.release.indexer,
    is_seadex: props.release.is_seadex,
    is_seadex_best: props.release.is_seadex_best,
    parsed_air_date: props.release.parsed_air_date,
    parsed_episode_label: props.release.parsed_episode_label,
    quality: props.release.quality,
    remake: props.release.remake,
    resolution: props.release.parsed_resolution,
    seadex_dual_audio: props.release.seadex_dual_audio,
    trusted: props.release.trusted,
  });
  const releaseConfidence = getReleaseConfidence(releaseDisplay.confidence);

  return (
    <TableRow class={cn("group", isRejected && "opacity-60 bg-muted/20")}>
      <TableCell class="font-medium max-w-[300px]">
        <ReleasePrimaryCell
          title={props.release.title}
          sourceUrl={props.release.view_url}
          titleClass="line-clamp-2 text-sm break-all hover:text-primary transition-colors"
          summaryCompact
          metadataPrefix={
            <span class="flex items-center gap-1">
              {formatDistanceToNow(new Date(props.release.publish_date), { addSuffix: true })}
            </span>
          }
          flags={releaseDisplay.flags}
          parsedSummary={releaseDisplay.parsedSummary}
          sourceSummary={releaseDisplay.sourceSummary}
          seadexNotes={props.release.seadex_notes}
          seadexTags={props.release.seadex_tags}
          seadexComparison={props.release.seadex_comparison}
          selectionKind={selectionDisplay.metadata.selection_kind}
          selectionLabel={selectionDisplay.label}
          selectionSummary={selectionDisplay.summary}
          selectionDetail={selectionDisplay.detail}
          confidence={releaseConfidence}
        />
      </TableCell>
      <TableCell class="text-xs">{props.release.indexer}</TableCell>
      <TableCell class="text-xs font-mono">{formatSize(props.release.size)}</TableCell>
      <TableCell class="text-xs">
        <ReleasePeersCell
          seeders={props.release.seeders}
          leechers={props.release.leechers}
          emphasizePresence
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary" class="w-fit text-xs">
          {props.release.quality}
        </Badge>
      </TableCell>
      <TableCell>
        <div class="flex flex-col gap-1 items-end">
          <Button
            size="sm"
            variant={isRejected ? "ghost" : "default"}
            class={cn(
              "h-7 w-full gap-1 text-xs",
              action.Accept && "bg-success hover:bg-success text-success-foreground",
              action.Upgrade && "bg-info hover:bg-info text-info-foreground",
              isRejected && "text-muted-foreground border",
            )}
            onClick={() => props.onDownload(props.release)}
            disabled={props.isDownloading}
          >
            <Show when={!props.isDownloading} fallback={<IconPlug class="h-3 w-3 animate-spin" />}>
              <IconDownload class="h-3.5 w-3.5" />
            </Show>
            {isRejected ? "Force" : "Grab"}
          </Button>
          <Show when={reason}>
            <span
              class="text-xs text-error text-right leading-tight max-w-[100px]"
              title={reason || ""}
            >
              {reason}
            </span>
          </Show>
        </div>
      </TableCell>
    </TableRow>
  );
}

function formatSize(bytes: number) {
  if (bytes === 0) return "N/A";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
