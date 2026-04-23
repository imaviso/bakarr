import type { DownloadEvent } from "@bakarr/shared";
import { Badge } from "~/components/ui/badge";
import { getDownloadEventMetadataSummary } from "~/lib/download-event-metadata";

interface DownloadEventCardProps {
  event: DownloadEvent;
  formatTimestamp: (value: string) => string;
}

export function DownloadEventCard(props: DownloadEventCardProps) {
  const metadataSummary = getDownloadEventMetadataSummary(props.event);

  return (
    <div className="rounded-none border border-border bg-card p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {props.event.anime_image && (
            <img
              src={props.event.anime_image}
              alt={props.event.anime_title ?? props.event.torrent_name ?? props.event.message}
              className="h-8 w-6 object-cover border border-border shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {props.event.anime_title ?? props.event.torrent_name ?? props.event.event_type}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {props.event.event_type}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {props.formatTimestamp(props.event.created_at)}
        </div>
      </div>
      <div className="text-sm text-foreground">{props.event.message}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {(props.event.from_status || props.event.to_status) && (
          <span>
            {props.event.from_status || "-"} -&gt; {props.event.to_status || "-"}
          </span>
        )}
        {props.event.download_id !== undefined && <span>Download #{props.event.download_id}</span>}
        {metadataSummary.coverage && (
          <Badge
            variant="outline"
            className="inline-flex items-center rounded-none h-5 px-1.5 text-xs font-normal"
          >
            {metadataSummary.coverage}
          </Badge>
        )}
      </div>
      {(metadataSummary.source ||
        metadataSummary.parsed ||
        metadataSummary.decision ||
        metadataSummary.importedPath) && (
        <div className="space-y-1 text-[11px] text-muted-foreground">
          {metadataSummary.source && <div>{metadataSummary.source}</div>}
          {metadataSummary.parsed && <div>{metadataSummary.parsed}</div>}
          {metadataSummary.decision && <div>{metadataSummary.decision}</div>}
          {metadataSummary.importedPath && (
            <div className="font-mono break-all">{metadataSummary.importedPath}</div>
          )}
        </div>
      )}
    </div>
  );
}
