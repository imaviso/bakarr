import { WarningIcon, DownloadIcon, SpinnerIcon, PlugIcon, VideoIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
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
    <DialogContent className="sm:max-w-7xl w-full max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Manual Search</DialogTitle>
        <DialogDescription>
          Searching for Episode {props.episodeNumber}
          {props.episodeTitle && `- ${props.episodeTitle}`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-hidden min-h-[200px] flex flex-col">
        {!props.state.searchQuery.isLoading ? (
          <>
            {!props.state.searchQuery.error ? (
              <>
                {props.state.searchQuery.data && props.state.searchQuery.data.length > 0 ? (
                  <div className="flex-1 border rounded-none overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted sticky top-0 z-10 border-b">
                        <TableRow>
                          <TableHead scope="col">Release</TableHead>
                          <TableHead scope="col" className="w-[100px]">
                            Indexer
                          </TableHead>
                          <TableHead scope="col" className="w-[80px]">
                            Size
                          </TableHead>
                          <TableHead scope="col" className="w-[80px]">
                            Peers
                          </TableHead>
                          <TableHead scope="col" className="w-[120px]">
                            Profile
                          </TableHead>
                          <TableHead scope="col" className="w-[100px]">
                            Action
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {props.state.searchQuery.data.map((release) => (
                          <SearchReleaseRow
                            key={release.info_hash ?? release.title}
                            release={release}
                            onDownload={props.state.handleDownload}
                            isDownloading={props.state.grabRelease.isPending}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                    <VideoIcon className="h-12 w-12 opacity-20" />
                    <p className="mt-2">No releases found</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-error gap-2">
                <WarningIcon className="h-8 w-8" />
                <p>Error searching for releases</p>
                <p className="text-sm text-muted-foreground">
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
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-8">
            <SpinnerIcon className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Searching releases...</p>
          </div>
        )}
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
    <TableRow className={cn("group", isRejected && "opacity-60 bg-muted")}>
      <TableCell className="font-medium max-w-[300px]">
        <ReleasePrimaryCell
          title={props.release.title}
          sourceUrl={props.release.view_url}
          titleClass="line-clamp-2 text-sm break-all hover:text-primary transition-colors"
          summaryCompact
          metadataPrefix={
            <span className="flex items-center gap-1">
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
      <TableCell className="text-xs">{props.release.indexer}</TableCell>
      <TableCell className="text-xs font-mono">{formatSize(props.release.size)}</TableCell>
      <TableCell className="text-xs">
        <ReleasePeersCell
          seeders={props.release.seeders}
          leechers={props.release.leechers}
          emphasizePresence
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="w-fit text-xs">
          {props.release.quality}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 items-end">
          <Button
            size="sm"
            variant={isRejected ? "ghost" : "default"}
            className={cn(
              "h-7 w-full gap-1 text-xs",
              action.Accept && "bg-success hover:bg-success text-success-foreground",
              action.Upgrade && "bg-info hover:bg-info text-info-foreground",
              isRejected && "text-muted-foreground border",
            )}
            onClick={() => props.onDownload(props.release)}
            disabled={props.isDownloading}
          >
            {props.isDownloading ? (
              <PlugIcon className="h-3 w-3 animate-spin" />
            ) : (
              <DownloadIcon className="h-3.5 w-3.5" />
            )}
            {isRejected ? "Force" : "Grab"}
          </Button>
          {reason && (
            <span
              className="text-xs text-error text-right leading-tight max-w-[100px]"
              title={reason || ""}
            >
              {reason}
            </span>
          )}
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
