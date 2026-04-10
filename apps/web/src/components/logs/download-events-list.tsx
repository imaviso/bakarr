import { DownloadEventsFeed } from "~/components/download-events/download-events-feed";
import type { DownloadEvent } from "~/lib/api";

interface DownloadEventsListProps {
  events: DownloadEvent[];
  formatTimestamp: (createdAt: string) => string;
  onSelectEvent: (event: DownloadEvent) => void;
  hideCount?: boolean;
}

export function DownloadEventsList(props: DownloadEventsListProps) {
  return (
    <DownloadEventsFeed
      events={props.events}
      formatTimestamp={props.formatTimestamp}
      isLoading={false}
      emptyText="No recent download events"
      onSelectEvent={props.onSelectEvent}
      showCount={!props.hideCount}
      virtualized
      maxHeightPx={600}
      class="overflow-y-auto px-4 pb-4"
    />
  );
}
