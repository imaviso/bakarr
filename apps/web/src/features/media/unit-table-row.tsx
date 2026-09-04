import {
  RiCheckboxCircleLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiLink,
  RiMoreLine,
  RiPlayLine,
  RiRefreshLine,
  RiSearchLine,
} from "@remixicon/react";
import { IconButton } from "@/components/shared/icon-button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "@/features/media/media-details-types";
import type { MediaUnit } from "@/api/contracts";
import { formatDate, isAired } from "@/domain/date-time";
import { mediaUnitLabel } from "@/domain/media-unit";
import { formatDurationSeconds } from "@/domain/scanned-file";
import { cn } from "@/infra/utils";

interface EpisodeTableRowProps {
  episode: MediaUnit;
  onOpenSearchModal: (state: AnimeSearchModalState) => void;
  onOpenMappingDialog: (state: AnimeEpisodeDialogState) => void;
  onOpenDeleteDialog: (state: AnimeEpisodeDialogState) => void;
  onPlayInMpv: (unitNumber: number) => void;
  onCopyStreamLink: (unitNumber: number) => void;
}

export function EpisodeTableRow(props: EpisodeTableRowProps) {
  const episode = props.episode;
  const unitLabel = mediaUnitLabel(episode.unit_kind);
  const searchModalState: AnimeSearchModalState = {
    open: true,
    unitNumber: episode.number,
    ...(episode.unit_kind == null ? {} : { unitKind: episode.unit_kind }),
    ...(episode.title == null ? {} : { unitTitle: episode.title }),
  };
  const mappingDialogState: AnimeEpisodeDialogState = {
    open: true,
    unitNumber: episode.number,
    ...(episode.unit_kind == null ? {} : { unitKind: episode.unit_kind }),
  };
  const deleteDialogState: AnimeEpisodeDialogState = {
    open: true,
    unitNumber: episode.number,
    ...(episode.unit_kind == null ? {} : { unitKind: episode.unit_kind }),
  };

  return (
    <TableRow className="group cursor-default">
      <TableCell className="font-medium text-center text-muted-foreground group-hover:text-foreground">
        {episode.number}
      </TableCell>
      <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] md:max-w-[350px]">
        <div className="truncate" title={episode.title || `${unitLabel} ${episode.number}`}>
          {episode.title || `${unitLabel} ${episode.number}`}
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
        {episode.aired ? formatDate(episode.aired) : "-"}
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
        {formatDurationSeconds(episode.duration_seconds) || "-"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end pr-2">
          {episode.downloaded ? (
            <TooltipTrigger aria-label="Downloaded">
              <RiCheckboxCircleLine className="h-4 w-4 text-success" />
              <Tooltip>Downloaded - {episode.file_path?.split("/").pop()}</Tooltip>
            </TooltipTrigger>
          ) : (
            <TooltipTrigger aria-label={isAired(episode.aired) ? "Missing" : "Upcoming"}>
              <RiCloseLine
                className={cn(
                  "h-4 w-4",
                  isAired(episode.aired) ? "text-warning" : "text-muted-foreground",
                )}
              />
              <Tooltip>{isAired(episode.aired) ? "Missing" : "Upcoming"}</Tooltip>
            </TooltipTrigger>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums truncate max-w-[200px]">
        {episode.file_path ? (
          <div className="truncate" title={episode.file_path.split("/").pop()}>
            {episode.file_path.split("/").pop()}
          </div>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>
        <DropdownMenuTrigger>
          <IconButton
            aria-label={`Actions for ${unitLabel.toLowerCase()} ${episode.number}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <RiMoreLine className="h-4 w-4" />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuItem onAction={() => props.onOpenSearchModal(searchModalState)}>
              {episode.downloaded ? (
                <>
                  <RiRefreshLine className="h-4 w-4 mr-2" />
                  Replace
                </>
              ) : (
                <>
                  <RiSearchLine className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </DropdownMenuItem>

            {!episode.downloaded && (
              <DropdownMenuItem onAction={() => props.onOpenMappingDialog(mappingDialogState)}>
                <RiLink className="h-4 w-4 mr-2" />
                Manual Map
              </DropdownMenuItem>
            )}

            {episode.downloaded && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onAction={() => props.onOpenDeleteDialog(deleteDialogState)}
                >
                  <RiDeleteBinLine className="h-4 w-4 mr-2" />
                  Delete File
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onAction={() => props.onPlayInMpv(episode.number)}>
                  <RiPlayLine className="h-4 w-4 mr-2" />
                  Play in MPV
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => props.onCopyStreamLink(episode.number)}>
                  <RiFileCopyLine className="h-4 w-4 mr-2" />
                  Copy Stream Link
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenu>
        </DropdownMenuTrigger>
      </TableCell>
    </TableRow>
  );
}
