import { RiDeleteBinLine, RiLink, RiTimeLine, RiToggleLine } from "@remixicon/react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { IconButton } from "@/components/shared/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/domain/date-time";
import type { RssFeed } from "@/api/contracts";

export function FeedCard(props: {
  feed: RssFeed;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <Card className="transition-colors duration-150 hover:bg-muted/50">
      <CardContent className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => props.onToggle(!props.feed.enabled)}
          aria-label={props.feed.enabled ? "Disable feed" : "Enable feed"}
        >
          {props.feed.enabled ? (
            <RiToggleLine className="h-6 w-6 text-success" />
          ) : (
            <RiToggleLine className="h-6 w-6 text-muted-foreground" />
          )}
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{props.feed.name || "Unnamed Feed"}</p>
            <Badge variant={props.feed.enabled ? "outline" : "secondary"}>
              {props.feed.enabled ? "Active" : "Paused"}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1 truncate max-w-md">
              <RiLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{props.feed.url}</span>
            </span>
            {props.feed.last_checked && (
              <span className="flex items-center gap-1 shrink-0">
                <RiTimeLine className="h-3.5 w-3.5" />
                {formatDateTime(props.feed.last_checked)}
              </span>
            )}
          </div>
        </div>
        <ConfirmDialog
          title="Delete RSS Feed"
          description={`Are you sure you want to delete "${
            props.feed.name || "this feed"
          }"? This action cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={props.onDelete}
          trigger={
            <IconButton
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete feed"
            >
              <RiDeleteBinLine className="h-4 w-4" />
            </IconButton>
          }
        />
      </CardContent>
    </Card>
  );
}
