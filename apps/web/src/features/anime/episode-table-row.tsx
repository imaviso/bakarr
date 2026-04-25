import {
  CheckCircleIcon,
  CopyIcon,
  DotsThreeIcon,
  LinkIcon,
  PlayIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { TableCell, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/features/anime/anime-details-types";
import type { Episode } from "~/api/contracts";
import { formatDate, isAired } from "~/domain/date-time";
import { formatDurationSeconds } from "~/domain/scanned-file";
import { cn } from "~/infra/utils";

interface EpisodeTableRowProps {
  episode: Episode;
  onOpenSearchModal: (state: AnimeSearchModalState) => void;
  onOpenMappingDialog: (state: AnimeEpisodeDialogState) => void;
  onOpenDeleteDialog: (state: AnimeEpisodeDialogState) => void;
  onPlayInMpv: (episodeNumber: number) => void;
  onCopyStreamLink: (episodeNumber: number) => void;
}

export function EpisodeTableRow(props: EpisodeTableRowProps) {
  const episode = props.episode;
  const searchModalState: AnimeSearchModalState = {
    open: true,
    episodeNumber: episode.number,
    ...(episode.title === undefined ? {} : { episodeTitle: episode.title }),
  };
  const mappingDialogState: AnimeEpisodeDialogState = {
    open: true,
    episodeNumber: episode.number,
  };
  const deleteDialogState: AnimeEpisodeDialogState = {
    open: true,
    episodeNumber: episode.number,
  };

  return (
    <TableRow className="group cursor-default">
      <TableCell className="font-medium text-center text-muted-foreground group-hover:text-foreground">
        {episode.number}
      </TableCell>
      <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] md:max-w-[350px]">
        <div className="truncate" title={episode.title || `Episode ${episode.number}`}>
          {episode.title || `Episode ${episode.number}`}
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
            <Tooltip>
              <TooltipTrigger>
                <CheckCircleIcon className="h-4 w-4 text-success" />
              </TooltipTrigger>
              <TooltipContent>Downloaded - {episode.file_path?.split("/").pop()}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <XIcon
                  className={cn(
                    "h-4 w-4",
                    isAired(episode.aired) ? "text-warning" : "text-muted-foreground",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>{isAired(episode.aired) ? "Missing" : "Upcoming"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono truncate max-w-[200px]">
        {episode.file_path ? (
          <div className="truncate" title={episode.file_path.split("/").pop()}>
            {episode.file_path.split("/").pop()}
          </div>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" />}
            aria-label={`Actions for episode ${episode.number}`}
            className="relative after:absolute after:-inset-2 h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <DotsThreeIcon className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => props.onOpenSearchModal(searchModalState)}>
              {episode.downloaded ? (
                <>
                  <ArrowClockwiseIcon className="h-4 w-4 mr-2" />
                  Replace
                </>
              ) : (
                <>
                  <MagnifyingGlassIcon className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </DropdownMenuItem>

            {!episode.downloaded && (
              <DropdownMenuItem onClick={() => props.onOpenMappingDialog(mappingDialogState)}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Manual Map
              </DropdownMenuItem>
            )}

            {episode.downloaded && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onOpenDeleteDialog(deleteDialogState);
                  }}
                >
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Delete File
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => props.onPlayInMpv(episode.number)}>
                  <PlayIcon className="h-4 w-4 mr-2" />
                  Play in MPV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onCopyStreamLink(episode.number)}>
                  <CopyIcon className="h-4 w-4 mr-2" />
                  Copy Stream Link
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
