import { RiCheckLine, RiTimeLine } from "@remixicon/react";
import { formatDistanceToNow } from "date-fns";
import type { ActivityItem } from "@/api/contracts";

export function ActivityRow(props: { item: ActivityItem }) {
  return (
    <div className="flex items-center gap-4 py-3 transition-colors hover:bg-muted">
      <div className="bg-success/10 p-2">
        <RiCheckLine className="h-4 w-4 text-success" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium">{props.item.media_title}</p>
        <p className="text-xs text-muted-foreground">{props.item.description}</p>
      </div>
      <time
        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
        dateTime={props.item.timestamp}
      >
        <RiTimeLine className="h-3.5 w-3.5" />
        {formatDistanceToNow(props.item.timestamp, {
          addSuffix: true,
        })}
      </time>
    </div>
  );
}
