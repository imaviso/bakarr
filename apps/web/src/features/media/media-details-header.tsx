import {
  ActivityIcon,
  ArrowLeftIcon,
  ProhibitIcon,
  BookmarkIcon,
  BroadcastIcon,
  CalendarIcon,
  CheckCircleIcon,
  DownloadIcon,
  FileArrowDownIcon,
  FolderOpenIcon,
  LinkIcon,
  ListIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  TextTIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { SearchDialog } from "~/features/search/search-dialog";
import type { Media } from "~/api/contracts";
import { createLogsRouteSearch } from "~/domain/download/events-search";
import { mediaKindLabel, mediaUnitLabel } from "~/domain/media-unit";
import { cn } from "~/infra/utils";

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
            className={buttonVariants({
              variant: "ghost",
              size: "icon",
              className: "shrink-0",
            })}
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

        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 no-scrollbar md:flex-wrap md:overflow-visible md:pb-0 md:mb-0">
          <TooltipTrigger>
            <Button
              variant={props.isMonitored ? "default" : "outline"}
              size="sm"
              onPress={props.onToggleMonitor}
              isDisabled={props.isToggleMonitorPending}
              className={cn("shrink-0", !props.isMonitored && "text-muted-foreground bg-muted")}
            >
              <BookmarkIcon className={cn("h-4 w-4", props.isMonitored && "fill-current")} />
            </Button>
            <Tooltip>
              {props.isMonitored ? `Unmonitor ${mediaLabel}` : `Monitor ${mediaLabel}`}
            </Tooltip>
          </TooltipTrigger>

          <TooltipTrigger>
            <Button
              variant="outline"
              size="sm"
              onPress={props.onRefreshEpisodes}
              isDisabled={props.isRefreshPending}
              className="shrink-0"
            >
              <ArrowClockwiseIcon
                className={cn("lg:mr-2 h-4 w-4", props.isRefreshPending && "animate-spin")}
              />
              <span className="hidden lg:inline">Refresh</span>
            </Button>
            <Tooltip>Refresh Metadata</Tooltip>
          </TooltipTrigger>

          <SearchDialog
            mediaId={props.mediaId}
            mediaKind={props.media.media_kind}
            defaultQuery={props.media.title.romaji}
            tooltip="Search Releases"
            trigger={
              <Button variant="outline" size="sm" className="shrink-0">
                <DownloadIcon className="lg:mr-2 h-4 w-4" />
                <span className="hidden lg:inline">Search</span>
              </Button>
            }
          />

          <TooltipTrigger>
            <Button
              variant="outline"
              size="sm"
              onPress={props.onSearchMissing}
              isDisabled={
                props.isSearchMissingPending || !props.isMonitored || props.missingCount === 0
              }
              className="shrink-0"
            >
              <MagnifyingGlassIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Search Missing</span>
            </Button>
            <Tooltip>Search Missing {unitLabelPlural}</Tooltip>
          </TooltipTrigger>

          <TooltipTrigger>
            <Button
              variant="outline"
              size="sm"
              onPress={props.onScanFolder}
              isDisabled={props.isScanFolderPending}
              className="shrink-0"
            >
              <FileArrowDownIcon
                className={cn("lg:mr-2 h-4 w-4", props.isScanFolderPending && "animate-spin")}
              />
              <span className="hidden lg:inline">Scan Folder</span>
            </Button>
            <Tooltip>Scan Folder</Tooltip>
          </TooltipTrigger>

          <TooltipTrigger>
            <Button variant="outline" size="sm" onPress={props.onRenameFiles} className="shrink-0">
              <TextTIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Rename</span>
            </Button>
            <Tooltip>Rename Files</Tooltip>
          </TooltipTrigger>

          <Link to="/media/import" search={{ mediaId: props.mediaId }} className="shrink-0">
            <Button variant="outline" size="sm">
              <FolderOpenIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Import</span>
            </Button>
          </Link>

          <TooltipTrigger>
            <Button
              variant="outline"
              size="sm"
              onPress={props.onOpenBulkMapping}
              className="shrink-0"
            >
              <LinkIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Map {unitLabelPlural}</span>
            </Button>
            <Tooltip>Manual Map {unitLabelPlural}</Tooltip>
          </TooltipTrigger>

          <Link
            to="/logs"
            search={createLogsRouteSearch({ mediaId: String(props.mediaId) })}
            className="shrink-0"
          >
            <Button variant="outline" size="sm">
              <ListIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Events</span>
            </Button>
          </Link>

          <AlertDialogTrigger>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${mediaLabel}`}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
              <Tooltip>Delete {mediaLabel}</Tooltip>
            </TooltipTrigger>
            <AlertDialog>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {mediaLabel}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove &quot;{props.media.title.english || props.media.title.romaji}
                  &quot; from your library. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onPress={props.onDeleteMedia}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialog>
          </AlertDialogTrigger>
        </div>
      </div>
    </>
  );
}
