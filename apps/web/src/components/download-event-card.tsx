import { createMemo, Show } from "solid-js";
import type { DownloadEvent } from "@bakarr/shared";
import { getDownloadEventMetadataSummary } from "~/lib/download-event-metadata";

interface DownloadEventCardProps {
  event: DownloadEvent;
  formatTimestamp: (value: string) => string;
}

export function DownloadEventCard(props: DownloadEventCardProps) {
  const metadataSummary = createMemo(() => getDownloadEventMetadataSummary(props.event));

  return (
    <div class="rounded-lg border border-border/60 bg-card p-3 space-y-1">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <Show when={props.event.anime_image}>
            <img
              src={props.event.anime_image}
              alt={props.event.anime_title ?? props.event.torrent_name ?? props.event.message}
              class="h-8 w-6 object-cover border border-border/60 shrink-0"
            />
          </Show>
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">
              {props.event.anime_title ?? props.event.torrent_name ?? props.event.event_type}
            </div>
            <div class="text-[11px] text-muted-foreground truncate">{props.event.event_type}</div>
          </div>
        </div>
        <div class="text-xs text-muted-foreground">
          {props.formatTimestamp(props.event.created_at)}
        </div>
      </div>
      <div class="text-sm text-foreground">{props.event.message}</div>
      <div class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <Show when={props.event.from_status || props.event.to_status}>
          <span>
            {props.event.from_status || "-"} -&gt; {props.event.to_status || "-"}
          </span>
        </Show>
        <Show when={props.event.download_id !== undefined}>
          <span>Download #{props.event.download_id}</span>
        </Show>
        <Show when={metadataSummary().coverage}>
          <span class="inline-flex items-center rounded-none border h-5 px-1.5 text-xs">
            {metadataSummary().coverage}
          </span>
        </Show>
      </div>
      <Show
        when={
          metadataSummary().source ||
          metadataSummary().parsed ||
          metadataSummary().decision ||
          metadataSummary().importedPath
        }
      >
        <div class="space-y-1 text-[11px] text-muted-foreground">
          <Show when={metadataSummary().source}>
            <div>{metadataSummary().source}</div>
          </Show>
          <Show when={metadataSummary().parsed}>
            <div>{metadataSummary().parsed}</div>
          </Show>
          <Show when={metadataSummary().decision}>
            <div>{metadataSummary().decision}</div>
          </Show>
          <Show when={metadataSummary().importedPath}>
            <div class="font-mono break-all">{metadataSummary().importedPath}</div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
