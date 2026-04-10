import {
  IconAlertTriangle,
  IconDownload,
  IconLoader2,
  IconPlug,
  IconVideo,
} from "@tabler/icons-solidjs";
import { formatDistanceToNow } from "date-fns";
import { createEffect, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
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
import { ReleaseSeaDexMeta, ReleaseSelectionMeta } from "~/components/release-search/release-meta";
import { ReleaseMetadataSummary } from "~/components/release-metadata-summary";
import {
  createEpisodeSearchQuery,
  createGrabReleaseMutation,
  type DownloadAction,
  type EpisodeSearchResult,
} from "~/lib/api";
import { formatReleaseSearchDecisionReason, inferBatchKind } from "~/lib/batch-kind";
import {
  formatReleaseParsedSummary,
  formatReleaseSourceSummary,
  getReleaseFlags,
} from "~/lib/release-metadata";
import {
  formatSelectionDetail,
  formatSelectionSummary,
  getReleaseConfidence,
  selectionKindLabel,
  selectionMetadataFromDownloadAction,
} from "~/lib/release-selection";
import { buildDownloadSourceMetadata, buildParsedEpisodeIdentity } from "~/lib/release-download";
import { cn } from "~/lib/utils";

interface SearchModalProps {
  animeId: number;
  episodeNumber: number;
  episodeTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function decisionReason(release: EpisodeSearchResult) {
  const batchKind = inferBatchKind({
    coveredEpisodes: release.parsed_episode_numbers,
    isBatch:
      (release.parsed_episode_numbers?.length ?? 0) > 1 ||
      (release.parsed_episode_label !== undefined && release.parsed_episode_numbers === undefined),
    sourceIdentity: release.parsed_air_date
      ? {
          air_dates: [release.parsed_air_date],
          label: release.parsed_episode_label ?? release.parsed_air_date,
          scheme: "daily",
        }
      : release.parsed_episode_numbers
        ? {
            episode_numbers: release.parsed_episode_numbers,
            label:
              release.parsed_episode_label ??
              String(release.parsed_episode_numbers[0] ?? "").padStart(2, "0"),
            scheme: "absolute",
          }
        : undefined,
  });

  if (release.download_action.Upgrade) {
    return `Upgrade: ${release.download_action.Upgrade.reason}`;
  }
  if (release.download_action.Accept) {
    return `Accepted ${release.download_action.Accept.quality.name} (score ${release.download_action.Accept.score})`;
  }
  if (release.download_action.Reject) {
    return `Manual override: ${release.download_action.Reject.reason}`;
  }

  return formatReleaseSearchDecisionReason({
    batchKind,
    isSeaDex: release.is_seadex,
    isSeaDexBest: release.is_seadex_best,
    trusted: release.trusted,
  });
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

function getActionReason(action: DownloadAction) {
  if (action.Reject) return action.Reject.reason;
  if (action.Upgrade) return action.Upgrade.reason;
  return null;
}

export function SearchModal(props: SearchModalProps) {
  const searchQuery = createEpisodeSearchQuery(
    () => props.animeId,
    () => props.episodeNumber,
  );

  const grabRelease = createGrabReleaseMutation();

  createEffect(() => {
    if (props.open) {
      void searchQuery.refetch();
    }
  });

  const handleDownload = (release: EpisodeSearchResult) => {
    const selection = selectionMetadataFromDownloadAction(release.download_action);
    const sourceIdentity = buildParsedEpisodeIdentity({
      parsedAirDate: release.parsed_air_date,
      parsedEpisodeLabel: release.parsed_episode_label,
      parsedEpisodeNumbers: release.parsed_episode_numbers,
    });

    const releaseMetadata = buildDownloadSourceMetadata({
      airDate: release.parsed_air_date,
      chosenFromSeaDex: selection.chosen_from_seadex,
      group: release.group,
      indexer: release.indexer,
      isSeaDex: release.is_seadex,
      isSeaDexBest: release.is_seadex_best,
      parsedTitle: release.title,
      previousQuality: selection.previous_quality,
      previousScore: selection.previous_score,
      remake: release.remake,
      resolution: release.parsed_resolution,
      seaDexComparison: release.seadex_comparison,
      seaDexDualAudio: release.seadex_dual_audio,
      seaDexNotes: release.seadex_notes,
      seaDexReleaseGroup: release.seadex_release_group,
      seaDexTags: release.seadex_tags,
      selectionKind: selection.selection_kind,
      selectionScore: selection.selection_score,
      sourceIdentity,
      sourceUrl: release.view_url,
      trusted: release.trusted,
    });

    const payload = {
      animeId: props.animeId,
      decisionReason: decisionReason(release),
      episodeNumber: props.episodeNumber,
      title: release.title,
      magnet: release.link,
      ...(release.group === undefined ? {} : { group: release.group }),
      ...(release.info_hash === undefined ? {} : { infoHash: release.info_hash }),
      releaseMetadata,
    };

    grabRelease.mutate(payload, {
      onSuccess: () => {
        props.onOpenChange(false);
        toast.success("Download started");
      },
      onError: (err) => {
        toast.error("Failed to queue download", {
          description: err instanceof Error ? err.message : String(err),
        });
      },
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
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
            when={!searchQuery.isLoading}
            fallback={
              <div class="h-full flex flex-col items-center justify-center gap-4 py-8">
                <IconLoader2 class="h-8 w-8 animate-spin text-muted-foreground" />
                <p class="text-muted-foreground">Searching releases...</p>
              </div>
            }
          >
            <Show
              when={!searchQuery.error}
              fallback={
                <div class="flex flex-col items-center justify-center flex-1 text-error gap-2">
                  <IconAlertTriangle class="h-8 w-8" />
                  <p>Error searching for releases</p>
                  <p class="text-sm text-muted-foreground">
                    {searchQuery.error instanceof Error
                      ? searchQuery.error.message
                      : String(searchQuery.error)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void searchQuery.refetch();
                    }}
                    class="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              }
            >
              <Show
                when={searchQuery.data && searchQuery.data.length > 0}
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
                      <For each={searchQuery.data}>
                        {(release) => {
                          const action = release.download_action;
                          const isRejected = !!action.Reject;
                          const reason = getActionReason(action);
                          const selectionMetadata = () =>
                            selectionMetadataFromDownloadAction(action);
                          const selectionSummary = () =>
                            formatSelectionSummary(selectionMetadata());
                          const selectionLabel = () =>
                            selectionKindLabel(selectionMetadata().selection_kind);
                          const selectionDetail = () => formatSelectionDetail(selectionMetadata());
                          const releaseConfidence = () => getReleaseConfidence(release);
                          const releaseFlags = () => getReleaseFlags(release);
                          const releaseSourceSummary = () =>
                            formatReleaseSourceSummary({
                              group: release.group,
                              indexer: release.indexer,
                              quality: release.quality,
                              resolution: release.parsed_resolution,
                            });
                          const releaseParsedSummary = () =>
                            formatReleaseParsedSummary({
                              parsed_air_date: release.parsed_air_date,
                              parsed_episode_label: release.parsed_episode_label,
                            });

                          return (
                            <TableRow class={cn("group", isRejected && "opacity-60 bg-muted/20")}>
                              <TableCell class="font-medium max-w-[300px]">
                                <div class="flex flex-col gap-1">
                                  <a
                                    href={release.view_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="line-clamp-2 text-sm break-all hover:text-primary transition-colors"
                                    title={release.title}
                                  >
                                    {release.title}
                                  </a>
                                  <div class="text-xs text-muted-foreground">
                                    <span class="flex items-center gap-1">
                                      {formatDistanceToNow(new Date(release.publish_date), {
                                        addSuffix: true,
                                      })}
                                    </span>
                                    <ReleaseMetadataSummary
                                      compact
                                      flags={releaseFlags()}
                                      parsedSummary={releaseParsedSummary()}
                                      sourceSummary={releaseSourceSummary()}
                                      sourceUrl={release.view_url}
                                    />
                                  </div>
                                  <ReleaseSeaDexMeta
                                    notes={release.seadex_notes}
                                    tags={release.seadex_tags}
                                    comparisonUrl={release.seadex_comparison}
                                  />
                                  <ReleaseSelectionMeta
                                    selectionKind={selectionMetadata().selection_kind}
                                    selectionLabel={selectionLabel()}
                                    selectionSummary={selectionSummary()}
                                    selectionDetail={selectionDetail()}
                                    confidence={releaseConfidence()}
                                  />
                                </div>
                              </TableCell>
                              <TableCell class="text-xs">{release.indexer}</TableCell>
                              <TableCell class="text-xs font-mono">
                                {formatSize(release.size)}
                              </TableCell>
                              <TableCell class="text-xs">
                                <span class="text-success font-medium">{release.seeders}</span>
                                {" / "}
                                <span class="text-error">{release.leechers}</span>
                              </TableCell>
                              <TableCell>
                                <div class="flex flex-col gap-1">
                                  <Badge variant="secondary" class="w-fit text-xs">
                                    {release.quality}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div class="flex flex-col gap-1 items-end">
                                  <Button
                                    size="sm"
                                    variant={isRejected ? "ghost" : "default"}
                                    class={cn(
                                      "h-7 w-full gap-1 text-xs",
                                      action.Accept &&
                                        "bg-success hover:bg-success text-success-foreground",
                                      action.Upgrade &&
                                        "bg-info hover:bg-info text-info-foreground",
                                      isRejected && "text-muted-foreground border",
                                    )}
                                    onClick={() => handleDownload(release)}
                                    disabled={grabRelease.isPending}
                                  >
                                    <Show
                                      when={!grabRelease.isPending}
                                      fallback={<IconPlug class="h-3 w-3 animate-spin" />}
                                    >
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
                        }}
                      </For>
                    </TableBody>
                  </Table>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
