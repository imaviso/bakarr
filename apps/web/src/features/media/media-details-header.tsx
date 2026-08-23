import {
  ActivityIcon,
  ArrowLeftIcon,
  BroadcastIcon,
  CalendarIcon,
  CheckCircleIcon,
  ProhibitIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { Media } from "@/api/contracts";
import { mediaKindLabel, mediaUnitLabel } from "@/domain/media-unit";
import { MediaDetailsToolbar } from "@/features/media/media-details-toolbar";

const STATUS_ICON_MAP: Record<string, React.ReactNode> = {
  RELEASING: <BroadcastIcon className="w-4 h-4 text-success" />,
  FINISHED: <CheckCircleIcon className="w-4 h-4 text-info" />,
  NOT_YET_RELEASED: <CalendarIcon className="w-4 h-4 text-warning" />,
  CANCELLED: <ProhibitIcon className="w-4 h-4 text-error" />,
};

function StatusIcon({ status }: { status: string }) {
  const icon = STATUS_ICON_MAP[status] ?? (
    <ActivityIcon className="w-4 h-4 text-muted-foreground" />
  );
  return (
    <TooltipTrigger aria-label={status}>
      {icon}
      <Tooltip>{status}</Tooltip>
    </TooltipTrigger>
  );
}

interface MediaDetailsHeaderProps {
  media: Media;
  mediaId: number;
  isMonitored: boolean;
  missingCount: number;
  isRefreshPending: boolean;
  isScanFolderPending: boolean;
  isSearchMissingPending: boolean;
  isToggleMonitorPending: boolean;
  onToggleMonitor: () => void;
  onRefreshEpisodes: () => void;
  onSearchMissing: () => void;
  onScanFolder: () => void;
  onRenameFiles: () => void;
  onOpenBulkMapping: () => void;
  onDeleteMedia: () => void;
}

export function MediaDetailsHeader(props: MediaDetailsHeaderProps) {
  const mediaLabel = mediaKindLabel(props.media.media_kind);
  const unitLabelPlural = mediaUnitLabel(
    props.media.media_kind === "anime" ? "episode" : "volume",
    2,
  );

  return (
    <>
      {props.media.banner_image && (
        <div className="w-full h-48 md:h-64 overflow-hidden rounded-none relative border-b border-border">
          <img
            src={props.media.banner_image}
            alt={`${props.media.title.english || props.media.title.romaji} banner`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4 relative">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Link
            to="/media"
            search={{ q: "", filter: "all", view: "grid" }}
            aria-label="Back to library"
            className={buttonVariants({ variant: "ghost", size: "icon", className: "shrink-0" })}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-medium tracking-tight overflow-hidden flex items-center gap-3 min-w-0">
              <span
                className="truncate min-w-0 flex-1"
                title={props.media.title.english || props.media.title.romaji}
              >
                {props.media.title.english || props.media.title.romaji}
              </span>
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                {props.media.format}
              </Badge>
              <StatusIcon status={props.media.status} />
              {props.media.title.native && (
                <>
                  <span>•</span>
                  <span className="font-japanese truncate">{props.media.title.native}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <MediaDetailsToolbar
          media={props.media}
          mediaId={props.mediaId}
          mediaLabel={mediaLabel}
          unitLabelPlural={unitLabelPlural}
          isMonitored={props.isMonitored}
          missingCount={props.missingCount}
          isRefreshPending={props.isRefreshPending}
          isScanFolderPending={props.isScanFolderPending}
          isSearchMissingPending={props.isSearchMissingPending}
          isToggleMonitorPending={props.isToggleMonitorPending}
          onToggleMonitor={props.onToggleMonitor}
          onRefreshEpisodes={props.onRefreshEpisodes}
          onSearchMissing={props.onSearchMissing}
          onScanFolder={props.onScanFolder}
          onRenameFiles={props.onRenameFiles}
          onOpenBulkMapping={props.onOpenBulkMapping}
          onDeleteMedia={props.onDeleteMedia}
        />
      </div>
    </>
  );
}
