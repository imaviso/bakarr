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
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { SearchDialog } from "~/features/search/search-dialog";
import type { Anime } from "~/api/contracts";
import { createLogsRouteSearch } from "~/domain/download/events-search";
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
    <Tooltip>
      <TooltipTrigger aria-label={status}>{icon}</TooltipTrigger>
      <TooltipContent>{status}</TooltipContent>
    </Tooltip>
  );
}

interface AnimeDetailsHeaderProps {
  anime: Anime;
  animeId: number;
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
  onDeleteAnime: () => void;
}

export function AnimeDetailsHeader(props: AnimeDetailsHeaderProps) {
  return (
    <>
      {props.anime.banner_image && (
        <div className="w-full h-48 md:h-64 overflow-hidden rounded-none relative border-b border-border">
          <img
            src={props.anime.banner_image}
            alt={`${props.anime.title.english || props.anime.title.romaji} banner`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4 relative">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Link
            to="/anime"
            search={{ q: "", filter: "all", view: "grid" }}
            aria-label="Back to anime library"
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
                title={props.anime.title.english || props.anime.title.romaji}
              >
                {props.anime.title.english || props.anime.title.romaji}
              </span>
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                {props.anime.format}
              </Badge>
              <StatusIcon status={props.anime.status} />
              {props.anime.title.native && (
                <>
                  <span>•</span>
                  <span className="font-japanese truncate">{props.anime.title.native}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 no-scrollbar md:flex-wrap md:overflow-visible md:pb-0 md:mb-0">
          <Tooltip>
            <TooltipTrigger
              render={<Button variant={props.isMonitored ? "default" : "outline"} size="sm" />}
              onClick={props.onToggleMonitor}
              disabled={props.isToggleMonitorPending}
              className={cn("shrink-0", !props.isMonitored && "text-muted-foreground bg-muted")}
            >
              <BookmarkIcon className={cn("h-4 w-4", props.isMonitored && "fill-current")} />
            </TooltipTrigger>
            <TooltipContent>
              {props.isMonitored ? "Unmonitor Anime" : "Monitor Anime"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline" size="sm" />}
              onClick={props.onRefreshEpisodes}
              disabled={props.isRefreshPending}
              className="shrink-0"
            >
              <ArrowClockwiseIcon
                className={cn("lg:mr-2 h-4 w-4", props.isRefreshPending && "animate-spin")}
              />
              <span className="hidden lg:inline">Refresh</span>
            </TooltipTrigger>
            <TooltipContent>Refresh Metadata</TooltipContent>
          </Tooltip>

          <SearchDialog
            animeId={props.animeId}
            defaultQuery={props.anime.title.romaji}
            tooltip="Search Releases"
            trigger={
              <Button variant="outline" size="sm" className="shrink-0">
                <DownloadIcon className="lg:mr-2 h-4 w-4" />
                <span className="hidden lg:inline">Search</span>
              </Button>
            }
          />

          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline" size="sm" />}
              onClick={props.onSearchMissing}
              disabled={
                props.isSearchMissingPending || !props.isMonitored || props.missingCount === 0
              }
              className="shrink-0"
            >
              <MagnifyingGlassIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Search Missing</span>
            </TooltipTrigger>
            <TooltipContent>Search Missing Episodes</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline" size="sm" />}
              onClick={props.onScanFolder}
              disabled={props.isScanFolderPending}
              className="shrink-0"
            >
              <FileArrowDownIcon
                className={cn("lg:mr-2 h-4 w-4", props.isScanFolderPending && "animate-spin")}
              />
              <span className="hidden lg:inline">Scan Folder</span>
            </TooltipTrigger>
            <TooltipContent>Scan Folder</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline" size="sm" />}
              onClick={props.onRenameFiles}
              className="shrink-0"
            >
              <TextTIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Rename</span>
            </TooltipTrigger>
            <TooltipContent>Rename Files</TooltipContent>
          </Tooltip>

          <Link to="/anime/import" search={{ animeId: props.animeId }} className="shrink-0">
            <Button variant="outline" size="sm">
              <FolderOpenIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Import</span>
            </Button>
          </Link>

          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline" size="sm" />}
              onClick={props.onOpenBulkMapping}
              className="shrink-0"
            >
              <LinkIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Map Episodes</span>
            </TooltipTrigger>
            <TooltipContent>Manual Map Episodes</TooltipContent>
          </Tooltip>

          <Link
            to="/logs"
            search={createLogsRouteSearch({ animeId: String(props.animeId) })}
            className="shrink-0"
          >
            <Button variant="outline" size="sm">
              <ListIcon className="lg:mr-2 h-4 w-4" />
              <span className="hidden lg:inline">Events</span>
            </Button>
          </Link>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger
                render={
                  <AlertDialogTrigger
                    render={<Button variant="ghost" size="icon" aria-label="Delete anime" />}
                  />
                }
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <TrashIcon className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Delete Anime</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Anime?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove &quot;{props.anime.title.english || props.anime.title.romaji}
                  &quot; from your library. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={props.onDeleteAnime}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
}
