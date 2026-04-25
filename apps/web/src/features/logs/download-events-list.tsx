import { DownloadEventsFeed } from "~/features/downloads/download-events/download-events-feed";
import type { DownloadEvent } from "~/api/contracts";

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
      className="overflow-y-auto px-4 pb-4"
    />
  );
}
