import { WarningIcon, ArrowDownIcon, CheckIcon, ClockIcon, PauseIcon } from "@phosphor-icons/react";
import { DownloadRowMeta } from "~/components/downloads/download-row-meta";
import {
  ActiveDownloadActions,
  HistoryDownloadActions,
} from "~/components/downloads/download-row-actions";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { TableCell, TableRow } from "~/components/ui/table";
import { type Download, type DownloadStatus } from "~/lib/api";
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
import { formatSelectionDetail } from "~/lib/release-selection";

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) {
    return "0 B/s";
  }

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
  const presentation = getDownloadStatusPresentation(props.status);

  const icon = () => {
    switch (presentation.icon) {
      case "alert":
        return <WarningIcon className="h-4 w-4 text-destructive shrink-0" />;
      case "arrow-down":
        return <ArrowDownIcon className="h-4 w-4 text-info shrink-0" />;
      case "check":
        return <CheckIcon className="h-4 w-4 text-success shrink-0" />;
      case "pause":
        return <PauseIcon className="h-4 w-4 text-warning shrink-0" />;
      default:
        return <ClockIcon className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  return <>{icon()}</>;
}

export function ActiveDownloadRow(props: { item: DownloadStatus }) {
  const statusPresentation = () => getDownloadStatusPresentation(props.item.state);
  const selectionDetail = () => formatSelectionDetail(props.item.source_metadata ?? {});

  return (
    <TableRow className="group h-12 align-top">
      <TableCell className="py-2 pl-4 w-[42px]">
        <DownloadStatusIcon status={props.item.state} />
      </TableCell>
      <TableCell className="font-medium py-2 min-w-[280px] md:min-w-[320px]">
        <DownloadRowMeta
          animeId={props.item.anime_id}
          animeImage={props.item.anime_image}
          animeTitle={props.item.anime_title ?? props.item.name}
          confidence={getDownloadReleaseConfidence(props.item)}
          decisionBadge={formatDownloadDecisionBadge(props.item)}
          decisionSummary={formatDownloadDecisionSummary(props.item)}
          downloadId={props.item.id}
          parsedSummary={formatDownloadParsedMeta(props.item)}
          releaseName={props.item.name}
          releaseSummary={formatDownloadReleaseMeta({
            group: props.item.source_metadata?.group,
            indexer: props.item.source_metadata?.indexer,
            quality: props.item.source_metadata?.quality,
            resolution: props.item.source_metadata?.resolution,
          })}
          selectionDetail={formatDownloadRankingMeta(props.item) ? selectionDetail() : undefined}
          selectionKind={props.item.source_metadata?.selection_kind}
          sourceUrl={props.item.source_metadata?.source_url}
          trusted={props.item.source_metadata?.trusted}
          remake={props.item.source_metadata?.remake}
        >
          {(props.item.is_batch ||
            props.item.covered_episodes?.length ||
            props.item.coverage_pending) && (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {formatEpisodeCoverage(
                props.item.episode_number ?? 1,
                props.item.covered_episodes,
                props.item.coverage_pending,
              )}
            </span>
          )}
        </DownloadRowMeta>
      </TableCell>
      <TableCell className="py-2 min-w-[160px] md:min-w-[180px]">
        <div className="flex items-center gap-2">
          <Progress value={props.item.progress * 100} className="h-1.5 w-full bg-muted" />
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {Math.round(props.item.progress * 100)}%
          </span>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
        {formatSpeed(props.item.speed)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap tabular-nums hidden md:table-cell">
        {formatEta(props.item.eta)}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-2">
          <span className="capitalize text-sm text-muted-foreground">
            {statusPresentation().label}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right py-2 pr-4">
        <ActiveDownloadActions
          allowedActions={props.item.allowed_actions}
          downloadId={props.item.id}
          statusPresentation={statusPresentation()}
          animeTitle={props.item.anime_title}
        />
      </TableCell>
    </TableRow>
  );
}

export function DownloadRow(props: { item: Download; isHistory?: boolean }) {
  const statusPresentation = () => getDownloadStatusPresentation(props.item.status);
  const selectionDetail = () => formatSelectionDetail(props.item.source_metadata ?? {});
  const dateStr = props.item.download_date || props.item.added_at;

  return (
    <TableRow className="group h-12 align-top">
      <TableCell className="py-2 pl-4 w-[42px]">
        <DownloadStatusIcon
          {...(props.item.status === undefined ? {} : { status: props.item.status })}
        />
      </TableCell>
      <TableCell className="font-medium py-2 min-w-[280px] md:min-w-[320px]">
        <DownloadRowMeta
          animeId={props.item.anime_id}
          animeImage={props.item.anime_image}
          animeTitle={props.item.anime_title}
          confidence={getDownloadReleaseConfidence(props.item)}
          decisionBadge={formatDownloadDecisionBadge(props.item)}
          decisionSummary={formatDownloadDecisionSummary(props.item)}
          errorMessage={props.item.error_message}
          importedPath={props.item.imported_path}
          parsedSummary={formatDownloadParsedMeta(props.item)}
          releaseName={props.item.torrent_name}
          releaseSummary={formatDownloadReleaseMeta({
            group: props.item.source_metadata?.group ?? props.item.group_name,
            indexer: props.item.source_metadata?.indexer,
            quality: props.item.source_metadata?.quality,
            resolution: props.item.source_metadata?.resolution,
          })}
          selectionDetail={formatDownloadRankingMeta(props.item) ? selectionDetail() : undefined}
          selectionKind={props.item.source_metadata?.selection_kind}
          sourceUrl={props.item.source_metadata?.source_url}
          trusted={props.item.source_metadata?.trusted}
          remake={props.item.source_metadata?.remake}
        />
      </TableCell>
      <TableCell className="py-2 min-w-[110px] md:min-w-[120px]">
        <Badge variant="outline" className="font-normal font-mono text-xs">
          {formatEpisodeCoverage(
            props.item.episode_number,
            props.item.covered_episodes,
            props.item.coverage_pending,
          )}
        </Badge>
        {formatCoverageMeta(props.item.covered_episodes, props.item.coverage_pending) && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {formatCoverageMeta(props.item.covered_episodes, props.item.coverage_pending)}
          </div>
        )}
      </TableCell>
      {props.isHistory ? (
        <TableCell className="text-muted-foreground text-sm whitespace-nowrap hidden md:table-cell">
          {dateStr ? new Date(dateStr).toLocaleString() : "-"}
        </TableCell>
      ) : (
        <TableCell className="py-2 min-w-[140px] md:min-w-[180px]">
          {props.item.status?.toLowerCase() === "downloading" &&
          props.item.progress !== undefined ? (
            <div className="flex items-center gap-2">
              <Progress value={props.item.progress ?? 0} className="h-1.5 w-full bg-muted" />
              <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                {Math.round(props.item.progress ?? 0)}%
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </TableCell>
      )}
      <TableCell className="py-2">
        <div className="flex items-center gap-2">
          <span className="capitalize text-sm text-muted-foreground">
            {statusPresentation().label}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right py-2 pr-4">
        <HistoryDownloadActions
          allowedActions={props.item.allowed_actions}
          downloadId={props.item.id}
          animeTitle={props.item.anime_title}
          status={props.item.status}
          reconciledAt={props.item.reconciled_at}
        />
      </TableCell>
    </TableRow>
  );
}
