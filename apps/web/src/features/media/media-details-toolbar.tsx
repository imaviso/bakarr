import {
  ArrowClockwiseIcon,
  BookmarkIcon,
  DownloadIcon,
  FileArrowDownIcon,
  FolderOpenIcon,
  LinkIcon,
  ListIcon,
  MagnifyingGlassIcon,
  TextTIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SearchDialog } from "@/features/search/search-dialog";
import type { Media } from "@/api/contracts";
import { createLogsRouteSearch } from "@/domain/download/events-search";
import { cn } from "@/infra/utils";

interface ToolbarProps {
  media: Media;
  mediaId: number;
  mediaLabel: string;
  unitLabelPlural: string;
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

function ToolbarButton(props: { tooltip: string; children: React.ReactNode }) {
  return (
    <TooltipTrigger>
      {props.children}
      <Tooltip>{props.tooltip}</Tooltip>
    </TooltipTrigger>
  );
}

export function MediaDetailsToolbar(props: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 no-scrollbar md:flex-wrap md:overflow-visible md:pb-0 md:mb-0">
      <ToolbarButton
        tooltip={
          props.isMonitored ? `Unmonitor ${props.mediaLabel}` : `Monitor ${props.mediaLabel}`
        }
      >
        <Button
          variant={props.isMonitored ? "default" : "outline"}
          size="sm"
          onPress={props.onToggleMonitor}
          isDisabled={props.isToggleMonitorPending}
          aria-label={
            props.isMonitored ? `Unmonitor ${props.mediaLabel}` : `Monitor ${props.mediaLabel}`
          }
          className={cn("shrink-0", !props.isMonitored && "text-muted-foreground bg-muted")}
        >
          <BookmarkIcon className={cn("h-4 w-4", props.isMonitored && "fill-current")} />
        </Button>
      </ToolbarButton>

      <ToolbarButton tooltip="Refresh Metadata">
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
      </ToolbarButton>

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

      <ToolbarButton tooltip={`Search Missing ${props.unitLabelPlural}`}>
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
      </ToolbarButton>

      <ToolbarButton tooltip="Scan Folder">
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
      </ToolbarButton>

      <ToolbarButton tooltip="Rename Files">
        <Button variant="outline" size="sm" onPress={props.onRenameFiles} className="shrink-0">
          <TextTIcon className="lg:mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Rename</span>
        </Button>
      </ToolbarButton>

      <Link to="/media/import" search={{ mediaId: props.mediaId }} className="shrink-0">
        <Button variant="outline" size="sm">
          <FolderOpenIcon className="lg:mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Import</span>
        </Button>
      </Link>

      <ToolbarButton tooltip={`Manual Map ${props.unitLabelPlural}`}>
        <Button variant="outline" size="sm" onPress={props.onOpenBulkMapping} className="shrink-0">
          <LinkIcon className="lg:mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Map {props.unitLabelPlural}</span>
        </Button>
      </ToolbarButton>

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

      <ConfirmDialog
        title={`Delete ${props.mediaLabel}?`}
        description={`This will remove "${props.media.title.english || props.media.title.romaji}" from your library. This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={props.onDeleteMedia}
        trigger={
          <ToolbarButton tooltip={`Delete ${props.mediaLabel}`}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${props.mediaLabel}`}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </ToolbarButton>
        }
      />
    </div>
  );
}
