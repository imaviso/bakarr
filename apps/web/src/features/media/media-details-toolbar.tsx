import {
  RiDeleteBinLine,
  RiDownloadLine,
  RiFolderOpenLine,
  RiLink,
  RiListUnordered,
} from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SearchDialog } from "@/features/search/search-dialog";
import type { Media } from "@/api/contracts";
import { createLogsRouteSearch } from "@/domain/download/events-search";
import type { MediaToolbarAction } from "@/features/media/media-toolbar-action";
import { cn } from "@/infra/utils";

interface ToolbarProps {
  media: Media;
  mediaId: number;
  mediaLabel: string;
  unitLabelPlural: string;
  actions: MediaToolbarAction[];
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
      {props.actions.map((action) => (
        <ToolbarButton key={action.key} tooltip={action.tooltip}>
          <Button
            variant={action.variant ?? "outline"}
            size="sm"
            onPress={action.onPress}
            isDisabled={Boolean(action.pending || action.disabled)}
            aria-label={action.tooltip}
            className="shrink-0"
          >
            <span
              className={cn(
                "lg:mr-2 h-4 w-4 flex items-center justify-center",
                action.pending && "animate-spin",
              )}
            >
              {action.icon}
            </span>
            {action.label && <span className="hidden lg:inline">{action.label}</span>}
          </Button>
        </ToolbarButton>
      ))}

      <SearchDialog
        mediaId={props.mediaId}
        mediaKind={props.media.media_kind}
        defaultQuery={props.media.title.romaji}
        tooltip="Search Releases"
        trigger={
          <Button variant="outline" size="sm" className="shrink-0">
            <RiDownloadLine className="lg:mr-2 h-4 w-4" />
            <span className="hidden lg:inline">Search</span>
          </Button>
        }
      />

      <Link to="/media/import" search={{ mediaId: props.mediaId }} className="shrink-0">
        <Button variant="outline" size="sm">
          <RiFolderOpenLine className="lg:mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Import</span>
        </Button>
      </Link>

      <ToolbarButton tooltip={`Manual Map ${props.unitLabelPlural}`}>
        <Button variant="outline" size="sm" className="shrink-0">
          <RiLink className="h-4 w-4" />
          <span className="hidden lg:inline">Map {props.unitLabelPlural}</span>
        </Button>
      </ToolbarButton>

      <Link
        to="/logs"
        search={createLogsRouteSearch({ mediaId: String(props.mediaId) })}
        className="shrink-0"
      >
        <Button variant="outline" size="sm">
          <RiListUnordered className="lg:mr-2 h-4 w-4" />
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
            <Button variant="outline" size="sm" className="shrink-0">
              <RiDeleteBinLine className="h-4 w-4" />
              <span className="hidden lg:inline">Delete</span>
            </Button>
          </ToolbarButton>
        }
      />
    </div>
  );
}
