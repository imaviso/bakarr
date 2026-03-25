import type { DownloadEvent } from "~/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import { getDownloadEventMetadataSummary } from "~/lib/download-event-metadata";

interface DownloadEventDetailsDialogProps {
  event: DownloadEvent | null;
  formatTimestamp: (value: string) => string;
  onOpenChange: (open: boolean) => void;
}

export function DownloadEventDetailsDialog(props: DownloadEventDetailsDialogProps) {
  const summary = () => (props.event ? getDownloadEventMetadataSummary(props.event) : undefined);

  return (
    <Dialog open={props.event !== null} onOpenChange={(open) => !open && props.onOpenChange(false)}>
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {props.event?.anime_title ??
              props.event?.torrent_name ??
              props.event?.event_type ??
              "Download Event"}
          </DialogTitle>
          <DialogDescription>
            {props.event ? props.formatTimestamp(props.event.created_at) : ""}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 text-sm">
          <div class="space-y-1">
            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Message
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 p-3">
              {props.event?.message}
            </div>
          </div>

          <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {props.event?.event_type ? (
              <Badge variant="outline">{props.event.event_type}</Badge>
            ) : null}
            {props.event?.download_id !== undefined ? (
              <Badge variant="outline">Download #{props.event.download_id}</Badge>
            ) : null}
            {summary()?.coverage ? <Badge variant="outline">{summary()?.coverage}</Badge> : null}
            {props.event?.from_status || props.event?.to_status ? (
              <Badge variant="outline">
                {props.event?.from_status || "-"} -&gt; {props.event?.to_status || "-"}
              </Badge>
            ) : null}
          </div>

          {summary()?.source ? (
            <div class="space-y-1">
              <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Release Context
              </div>
              <div>{summary()?.source}</div>
            </div>
          ) : null}

          {summary()?.parsed || summary()?.decision ? (
            <div class="space-y-1">
              <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Parsed Context
              </div>
              {summary()?.parsed ? <div>{summary()?.parsed}</div> : null}
              {summary()?.decision ? <div>{summary()?.decision}</div> : null}
            </div>
          ) : null}

          {summary()?.importedPath ? (
            <div class="space-y-1">
              <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Imported Path
              </div>
              <div class="rounded-md border border-border/60 bg-muted/20 p-3 font-mono break-all text-xs">
                {summary()?.importedPath}
              </div>
            </div>
          ) : null}

          {props.event?.metadata_json ? (
            <div class="space-y-1">
              <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Raw Metadata
              </div>
              <pre class="rounded-md border border-border/60 bg-muted/20 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(props.event.metadata_json, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
