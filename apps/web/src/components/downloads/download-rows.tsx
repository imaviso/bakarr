import {
  IconAlertTriangle,
  IconArrowDown,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { createMemo, Show } from "solid-js";
import { toast } from "solid-sonner";
import { DownloadEventsDialog } from "~/components/download-events-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { TableCell, TableRow } from "~/components/ui/table";
import {
  createDeleteDownloadMutation,
  createPauseDownloadMutation,
  createReconcileDownloadMutation,
  createResumeDownloadMutation,
  createRetryDownloadMutation,
  type Download,
  type DownloadStatus,
} from "~/lib/api";
import {
  formatCoverageMeta,
  formatDownloadDecisionBadge,
  formatDownloadDecisionSummary,
  formatDownloadParsedMeta,
  formatDownloadRankingMeta,
  formatDownloadReleaseMeta,
  formatEpisodeCoverage,
  getDownloadReleaseConfidence,
} from "~/lib/download-metadata";
import { getDownloadStatusPresentation } from "~/lib/download-status";
import {
  formatSelectionDetail,
  releaseConfidenceBadgeClass,
  selectionKindBadgeClass,
  selectionKindLabel,
} from "~/lib/release-selection";

function animeInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return `${parseFloat((bytesPerSec / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatEta(seconds: number): string {
  if (seconds === 8640000) return "∞";
  if (seconds <= 0) return "Done";

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function DownloadStatusIcon(props: { status?: string | undefined }) {
  const presentation = createMemo(() => getDownloadStatusPresentation(props.status));

  const icon = () => {
    switch (presentation().icon) {
      case "alert":
        return <IconAlertTriangle class="h-4 w-4 text-destructive shrink-0" />;
      case "arrow-down":
        return <IconArrowDown class="h-4 w-4 text-info shrink-0" />;
      case "check":
        return <IconCheck class="h-4 w-4 text-success shrink-0" />;
      case "pause":
        return <IconPlayerPause class="h-4 w-4 text-warning shrink-0" />;
      default:
        return <IconClock class="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  return <>{icon()}</>;
}

export function ActiveDownloadRow(props: { item: DownloadStatus }) {
  const pauseDownload = createPauseDownloadMutation();
  const resumeDownload = createResumeDownloadMutation();
  const retryDownload = createRetryDownloadMutation();
  const releaseConfidence = () => getDownloadReleaseConfidence(props.item);
  const statusPresentation = () => getDownloadStatusPresentation(props.item.state);

  const handlePause = () => {
    if (!props.item.id) return;

    toast.promise(pauseDownload.mutateAsync(props.item.id), {
      loading: "Pausing download...",
      success: "Download paused",
      error: (err) => `Failed to pause download: ${err.message}`,
    });
  };

  const handleResume = () => {
    if (!props.item.id) return;

    toast.promise(resumeDownload.mutateAsync(props.item.id), {
      loading: "Resuming download...",
      success: "Download resumed",
      error: (err) => `Failed to resume download: ${err.message}`,
    });
  };

  const handleRetry = () => {
    if (!props.item.id) return;

    toast.promise(retryDownload.mutateAsync(props.item.id), {
      loading: "Retrying download...",
      success: "Download retried",
      error: (err) => `Failed to retry download: ${err.message}`,
    });
  };

  return (
    <TableRow class="group h-12 align-top">
      <TableCell class="py-2 pl-4 w-[42px]">
        <DownloadStatusIcon status={props.item.state} />
      </TableCell>
      <TableCell class="font-medium py-2 min-w-[280px] md:min-w-[320px]">
        <div class="flex items-start gap-3">
          <Avatar class="size-8 rounded-md">
            <AvatarImage
              {...(props.item.anime_image === undefined ? {} : { src: props.item.anime_image })}
              alt={props.item.anime_title ?? props.item.name}
            />
            <AvatarFallback class="rounded-md text-xs font-medium">
              {animeInitials(props.item.anime_title ?? props.item.name)}
            </AvatarFallback>
          </Avatar>
          <div class="flex flex-col justify-center min-w-0">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <Show when={props.item.anime_id && props.item.anime_title}>
                {(animeId) => (
                  <Link
                    to="/anime/$id"
                    params={{ id: animeId().toString() }}
                    class="line-clamp-1 text-sm hover:underline min-w-0 max-w-full"
                    title={props.item.anime_title}
                  >
                    {props.item.anime_title}
                  </Link>
                )}
              </Show>
              <Show when={formatDownloadDecisionBadge(props.item)}>
                {(badge) => (
                  <Badge variant="secondary" class="h-5 px-1.5 text-xs shrink-0">
                    <IconSparkles class="h-3 w-3" />
                    {badge()}
                  </Badge>
                )}
              </Show>
            </div>
            <span class="line-clamp-1 text-xs text-muted-foreground" title={props.item.name}>
              {props.item.name}
            </span>
            <Show
              when={formatDownloadReleaseMeta({
                group: props.item.source_metadata?.group,
                indexer: props.item.source_metadata?.indexer,
                quality: props.item.source_metadata?.quality,
                resolution: props.item.source_metadata?.resolution,
              })}
            >
              {(meta) => <span class="text-xs text-muted-foreground line-clamp-1">{meta()}</span>}
            </Show>
            <Show when={formatDownloadDecisionSummary(props.item)}>
              {(summary) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{summary()}</span>
              )}
            </Show>
            <Show when={formatDownloadParsedMeta(props.item)}>
              {(parsedMeta) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{parsedMeta()}</span>
              )}
            </Show>
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
              <Show when={props.item.source_metadata?.trusted}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-success/20 bg-success/5 text-success"
                >
                  Trusted
                </Badge>
              </Show>
              <Show when={props.item.source_metadata?.remake}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-warning/20 bg-warning/5 text-warning"
                >
                  Remake
                </Badge>
              </Show>
              <Show when={props.item.source_metadata?.source_url}>
                {(sourceUrl) => (
                  <a
                    href={sourceUrl()}
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                  >
                    <IconExternalLink class="h-3 w-3" /> Source
                  </a>
                )}
              </Show>
            </div>
            <Show when={formatDownloadRankingMeta(props.item)}>
              <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                <Show when={selectionKindLabel(props.item.source_metadata?.selection_kind)}>
                  {(label) => (
                    <Badge
                      variant="secondary"
                      class={`h-4 px-1.5 ${selectionKindBadgeClass(
                        props.item.source_metadata?.selection_kind,
                      )}`}
                    >
                      {label()}
                    </Badge>
                  )}
                </Show>
                <Show when={formatSelectionDetail(props.item.source_metadata ?? {})}>
                  {(detail) => (
                    <span class="text-muted-foreground/80 line-clamp-1">{detail()}</span>
                  )}
                </Show>
              </div>
            </Show>
            <Show when={releaseConfidence()}>
              {(confidence) => (
                <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                  <Badge
                    variant="secondary"
                    class={`h-4 px-1.5 ${releaseConfidenceBadgeClass(confidence().tone)}`}
                  >
                    {confidence().label}
                  </Badge>
                  <span class="text-muted-foreground/80 line-clamp-1">{confidence().reason}</span>
                </div>
              )}
            </Show>
            <Show
              when={
                props.item.is_batch ||
                props.item.covered_episodes?.length ||
                props.item.coverage_pending
              }
            >
              <span class="text-xs text-muted-foreground line-clamp-1">
                {formatEpisodeCoverage(
                  props.item.episode_number ?? 1,
                  props.item.covered_episodes,
                  props.item.coverage_pending,
                )}
              </span>
            </Show>
            <Show when={props.item.id !== undefined}>
              <span class="text-xs text-muted-foreground">#{props.item.id}</span>
            </Show>
          </div>
        </div>
      </TableCell>
      <TableCell class="py-2 min-w-[160px] md:min-w-[180px]">
        <div class="flex items-center gap-2">
          <Progress value={props.item.progress * 100} class="h-1.5 w-full bg-muted" />
          <span class="text-xs font-mono text-muted-foreground w-8 text-right">
            {Math.round(props.item.progress * 100)}%
          </span>
        </div>
      </TableCell>
      <TableCell class="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
        {formatSpeed(props.item.speed)}
      </TableCell>
      <TableCell class="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
        {formatEta(props.item.eta)}
      </TableCell>
      <TableCell class="py-2">
        <div class="flex items-center gap-2">
          <span class="capitalize text-sm text-muted-foreground">{statusPresentation().label}</span>
        </div>
      </TableCell>
      <TableCell class="text-right py-2 pr-4">
        <div class="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Show
            when={
              statusPresentation().label.toLowerCase().includes("paused") ||
              statusPresentation().label.toLowerCase().includes("queued") ||
              statusPresentation().tone === "destructive"
            }
            fallback={
              <Button
                variant="ghost"
                size="icon"
                class="relative after:absolute after:-inset-2 h-7 w-7"
                aria-label="Pause download"
                onClick={handlePause}
                disabled={!props.item.id || pauseDownload.isPending}
              >
                <IconPlayerPause class="h-4 w-4" />
              </Button>
            }
          >
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-7 w-7"
              aria-label="Resume download"
              onClick={handleResume}
              disabled={!props.item.id || resumeDownload.isPending}
            >
              <IconPlayerPlay class="h-4 w-4" />
            </Button>
          </Show>
          <DownloadEventsDialog
            description="Timeline of queue, status, and import events for this download."
            {...(props.item.id === undefined ? {} : { downloadId: props.item.id })}
            formatTimestamp={(value) => new Date(value).toLocaleString()}
            title={`Download Events${props.item.anime_title ? ` - ${props.item.anime_title}` : ""}`}
            triggerLabel="View download events"
          />
          <Show when={statusPresentation().tone === "destructive"}>
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-7 w-7"
              aria-label="Retry download"
              onClick={handleRetry}
              disabled={!props.item.id || retryDownload.isPending}
            >
              <IconRefresh class="h-4 w-4" />
            </Button>
          </Show>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function DownloadRow(props: { item: Download; isHistory?: boolean }) {
  const retryDownload = createRetryDownloadMutation();
  const reconcileDownload = createReconcileDownloadMutation();
  const deleteDownload = createDeleteDownloadMutation();
  const releaseConfidence = () => getDownloadReleaseConfidence(props.item);
  const statusPresentation = () => getDownloadStatusPresentation(props.item.status);

  const handleRetry = () => {
    toast.promise(retryDownload.mutateAsync(props.item.id), {
      loading: "Retrying download...",
      success: "Download retried",
      error: (err) => `Failed to retry download: ${err.message}`,
    });
  };

  const handleDelete = () => {
    toast.promise(deleteDownload.mutateAsync({ downloadId: props.item.id }), {
      loading: "Removing download...",
      success: "Download removed",
      error: (err) => `Failed to remove download: ${err.message}`,
    });
  };

  const handleReconcile = () => {
    toast.promise(reconcileDownload.mutateAsync(props.item.id), {
      loading: "Reconciling download...",
      success: "Download reconciled",
      error: (err) => `Failed to reconcile download: ${err.message}`,
    });
  };

  const dateStr = props.item.download_date || props.item.added_at;

  return (
    <TableRow class="group h-12 align-top">
      <TableCell class="py-2 pl-4 w-[42px]">
        <DownloadStatusIcon
          {...(props.item.status === undefined ? {} : { status: props.item.status })}
        />
      </TableCell>
      <TableCell class="font-medium py-2 min-w-[280px] md:min-w-[320px]">
        <div class="flex items-start gap-3">
          <Avatar class="size-8 rounded-md">
            <AvatarImage
              {...(props.item.anime_image === undefined ? {} : { src: props.item.anime_image })}
              alt={props.item.anime_title}
            />
            <AvatarFallback class="rounded-md text-xs font-medium">
              {animeInitials(props.item.anime_title)}
            </AvatarFallback>
          </Avatar>
          <div class="flex flex-col justify-center min-w-0">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <Link
                to="/anime/$id"
                params={{ id: props.item.anime_id.toString() }}
                class="line-clamp-1 hover:underline min-w-0 max-w-full"
                title={props.item.anime_title}
              >
                {props.item.anime_title}
              </Link>
              <Show when={formatDownloadDecisionBadge(props.item)}>
                {(badge) => (
                  <Badge variant="secondary" class="h-5 px-1.5 text-xs shrink-0">
                    <IconSparkles class="h-3 w-3" />
                    {badge()}
                  </Badge>
                )}
              </Show>
            </div>
            <span class="text-xs text-muted-foreground line-clamp-1">
              {props.item.torrent_name}
            </span>
            <Show
              when={formatDownloadReleaseMeta({
                group: props.item.source_metadata?.group ?? props.item.group_name,
                indexer: props.item.source_metadata?.indexer,
                quality: props.item.source_metadata?.quality,
                resolution: props.item.source_metadata?.resolution,
              })}
            >
              {(meta) => <span class="text-xs text-muted-foreground line-clamp-1">{meta()}</span>}
            </Show>
            <Show when={formatDownloadDecisionSummary(props.item)}>
              {(summary) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{summary()}</span>
              )}
            </Show>
            <Show when={formatDownloadParsedMeta(props.item)}>
              {(parsedMeta) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">{parsedMeta()}</span>
              )}
            </Show>
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
              <Show when={props.item.source_metadata?.trusted}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-success/20 bg-success/5 text-success"
                >
                  Trusted
                </Badge>
              </Show>
              <Show when={props.item.source_metadata?.remake}>
                <Badge
                  variant="outline"
                  class="h-4 px-1.5 border-warning/20 bg-warning/5 text-warning"
                >
                  Remake
                </Badge>
              </Show>
            </div>
            <Show when={formatDownloadRankingMeta(props.item)}>
              <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                <Show when={selectionKindLabel(props.item.source_metadata?.selection_kind)}>
                  {(label) => (
                    <Badge
                      variant="secondary"
                      class={`h-4 px-1.5 ${selectionKindBadgeClass(
                        props.item.source_metadata?.selection_kind,
                      )}`}
                    >
                      {label()}
                    </Badge>
                  )}
                </Show>
                <Show when={formatSelectionDetail(props.item.source_metadata ?? {})}>
                  {(detail) => (
                    <span class="text-muted-foreground/80 line-clamp-1">{detail()}</span>
                  )}
                </Show>
              </div>
            </Show>
            <Show when={releaseConfidence()}>
              {(confidence) => (
                <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                  <Badge
                    variant="secondary"
                    class={`h-4 px-1.5 ${releaseConfidenceBadgeClass(confidence().tone)}`}
                  >
                    {confidence().label}
                  </Badge>
                  <span class="text-muted-foreground/80 line-clamp-1">{confidence().reason}</span>
                </div>
              )}
            </Show>
            <Show when={props.item.imported_path}>
              {(importedPath) => (
                <span class="text-[11px] text-muted-foreground line-clamp-1">
                  Imported to {importedPath()}
                </span>
              )}
            </Show>
            <Show when={props.item.source_metadata?.source_url}>
              {(sourceUrl) => (
                <a
                  href={sourceUrl()}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 w-fit"
                >
                  <IconExternalLink class="h-3 w-3" /> Source
                </a>
              )}
            </Show>
            <Show when={props.item.error_message}>
              <span class="text-xs text-destructive line-clamp-1">{props.item.error_message}</span>
            </Show>
          </div>
        </div>
      </TableCell>
      <TableCell class="py-2 min-w-[110px] md:min-w-[120px]">
        <Badge variant="outline" class="font-normal font-mono text-xs">
          {formatEpisodeCoverage(
            props.item.episode_number,
            props.item.covered_episodes,
            props.item.coverage_pending,
          )}
        </Badge>
        <Show when={formatCoverageMeta(props.item.covered_episodes, props.item.coverage_pending)}>
          {(meta) => <div class="mt-1 text-[11px] text-muted-foreground">{meta()}</div>}
        </Show>
      </TableCell>
      <Show
        when={!props.isHistory}
        fallback={
          <TableCell class="text-muted-foreground text-sm whitespace-nowrap hidden md:table-cell">
            {dateStr ? new Date(dateStr).toLocaleString() : "-"}
          </TableCell>
        }
      >
        <TableCell class="py-2 min-w-[140px] md:min-w-[180px]">
          <Show
            when={
              props.item.status?.toLowerCase() === "downloading" &&
              props.item.progress !== undefined
            }
            fallback={<span class="text-muted-foreground text-sm">-</span>}
          >
            <div class="flex items-center gap-2">
              <Progress value={props.item.progress ?? 0} class="h-1.5 w-full bg-muted" />
              <span class="text-xs font-mono text-muted-foreground w-8 text-right">
                {Math.round(props.item.progress ?? 0)}%
              </span>
            </div>
          </Show>
        </TableCell>
      </Show>
      <TableCell class="py-2">
        <div class="flex items-center gap-2">
          <span class="capitalize text-sm text-muted-foreground">{statusPresentation().label}</span>
        </div>
      </TableCell>
      <TableCell class="text-right py-2 pr-4">
        <div class="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <DownloadEventsDialog
            description="Timeline of queue, status, retry, and import events for this historical download."
            downloadId={props.item.id}
            formatTimestamp={(value) => new Date(value).toLocaleString()}
            title={`Download Events - ${props.item.anime_title}`}
            triggerLabel="View download events"
          />
          <Show
            when={props.item.status?.toLowerCase() === "completed" && !props.item.reconciled_at}
          >
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-7 w-7"
              aria-label="Mark as reconciled"
              onClick={handleReconcile}
              disabled={reconcileDownload.isPending}
            >
              <IconCheck class="h-4 w-4" />
            </Button>
          </Show>
          <Show
            when={
              props.item.status?.toLowerCase() === "failed" ||
              props.item.status?.toLowerCase() === "error"
            }
          >
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-7 w-7"
              aria-label="Retry download"
              onClick={handleRetry}
              disabled={retryDownload.isPending}
            >
              <IconRefresh class="h-4 w-4" />
            </Button>
          </Show>
          <Button
            variant="ghost"
            size="icon"
            class="relative after:absolute after:-inset-2 h-7 w-7"
            aria-label="Remove download"
            onClick={handleDelete}
            disabled={deleteDownload.isPending}
          >
            <IconTrash class="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
