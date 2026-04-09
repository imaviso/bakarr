import {
  IconActivity,
  IconArrowLeft,
  IconBan,
  IconBookmark,
  IconBroadcast,
  IconCalendar,
  IconCircleCheck,
  IconDownload,
  IconFileImport,
  IconFolderSearch,
  IconLink,
  IconList,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconTypography,
} from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { ImportDialog } from "~/components/import-dialog";
import { SearchDialog } from "~/components/search-dialog";
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
import { Button, buttonVariants } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { Anime } from "~/lib/api";
import { cn } from "~/lib/utils";

interface AnimeDetailsHeaderProps {
  anime: Anime;
  animeId: number;
  isMonitored: boolean;
  missingCount: number;
  isRefreshPending: boolean;
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
      <Show when={props.anime.banner_image}>
        <div class="w-full h-48 md:h-64 overflow-hidden rounded-none relative border-b border-border">
          <img
            src={props.anime.banner_image}
            alt={`${props.anime.title.english || props.anime.title.romaji} banner`}
            loading="lazy"
            class="w-full h-full object-cover"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>
      </Show>

      <div class="flex flex-col md:flex-row md:items-center gap-4 relative">
        <div class="flex items-center gap-4 flex-1 min-w-0">
          <Link
            to="/anime"
            search={{ q: "", filter: "all", view: "grid" }}
            class={buttonVariants({
              variant: "ghost",
              size: "icon",
              class: "shrink-0",
            })}
          >
            <IconArrowLeft class="h-4 w-4" />
          </Link>
          <div class="flex-1 min-w-0">
            <h1 class="text-xl font-semibold tracking-tight overflow-hidden flex items-center gap-3 min-w-0">
              <span
                class="truncate min-w-0 flex-1"
                title={props.anime.title.english || props.anime.title.romaji}
              >
                {props.anime.title.english || props.anime.title.romaji}
              </span>
            </h1>
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" class="text-xs">
                {props.anime.format}
              </Badge>
              <Tooltip>
                <TooltipTrigger aria-label={props.anime.status}>
                  <Show when={props.anime.status === "RELEASING"}>
                    <IconBroadcast class="w-4 h-4 text-success" />
                  </Show>
                  <Show when={props.anime.status === "FINISHED"}>
                    <IconCircleCheck class="w-4 h-4 text-info" />
                  </Show>
                  <Show when={props.anime.status === "NOT_YET_RELEASED"}>
                    <IconCalendar class="w-4 h-4 text-warning" />
                  </Show>
                  <Show when={props.anime.status === "CANCELLED"}>
                    <IconBan class="w-4 h-4 text-error" />
                  </Show>
                  <Show
                    when={
                      !["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED"].includes(
                        props.anime.status,
                      )
                    }
                  >
                    <IconActivity class="w-4 h-4 text-muted-foreground" />
                  </Show>
                </TooltipTrigger>
                <TooltipContent>{props.anime.status}</TooltipContent>
              </Tooltip>
              <Show when={props.anime.title.native}>
                <span>•</span>
                <span class="font-japanese opacity-75">{props.anime.title.native}</span>
              </Show>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 no-scrollbar md:overflow-visible md:pb-0 md:mb-0">
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant={props.isMonitored ? "default" : "outline"}
              size="sm"
              onClick={props.onToggleMonitor}
              disabled={props.isToggleMonitorPending}
              class={cn("shrink-0", !props.isMonitored && "text-muted-foreground bg-muted/50")}
            >
              <IconBookmark class={cn("h-4 w-4", props.isMonitored && "fill-current")} />
            </TooltipTrigger>
            <TooltipContent>
              {props.isMonitored ? "Unmonitor Anime" : "Monitor Anime"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="outline"
              size="sm"
              onClick={props.onRefreshEpisodes}
              disabled={props.isRefreshPending}
              class="shrink-0"
            >
              <IconRefresh
                class={cn("min-[1670px]:mr-2 h-4 w-4", props.isRefreshPending && "animate-spin")}
              />
              <span class="hidden min-[1670px]:inline">Refresh</span>
            </TooltipTrigger>
            <TooltipContent>Refresh Metadata</TooltipContent>
          </Tooltip>

          <SearchDialog
            animeId={props.animeId}
            defaultQuery={props.anime.title.romaji}
            tooltip="Search Releases"
            trigger={
              <Button variant="outline" size="sm" class="shrink-0">
                <IconDownload class="min-[1670px]:mr-2 h-4 w-4" />
                <span class="hidden min-[1670px]:inline">Search</span>
              </Button>
            }
          />

          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="outline"
              size="sm"
              onClick={props.onSearchMissing}
              disabled={
                props.isSearchMissingPending || !props.isMonitored || props.missingCount === 0
              }
              class="shrink-0"
            >
              <IconSearch class="min-[1670px]:mr-2 h-4 w-4" />
              <span class="hidden min-[1670px]:inline">Search Missing</span>
            </TooltipTrigger>
            <TooltipContent>Search Missing Episodes</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="outline"
              size="sm"
              onClick={props.onScanFolder}
              class="shrink-0"
            >
              <IconFileImport class="min-[1670px]:mr-2 h-4 w-4" />
              <span class="hidden min-[1670px]:inline">Scan Folder</span>
            </TooltipTrigger>
            <TooltipContent>Scan Folder</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="outline"
              size="sm"
              onClick={props.onRenameFiles}
              class="shrink-0"
            >
              <IconTypography class="min-[1670px]:mr-2 h-4 w-4" />
              <span class="hidden min-[1670px]:inline">Rename</span>
            </TooltipTrigger>
            <TooltipContent>Rename Files</TooltipContent>
          </Tooltip>

          <ImportDialog
            animeId={props.animeId}
            tooltip="Import Files"
            trigger={
              <Button variant="outline" size="sm" class="shrink-0">
                <IconFolderSearch class="min-[1670px]:mr-2 h-4 w-4" />
                <span class="hidden min-[1670px]:inline">Import</span>
              </Button>
            }
          />

          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="outline"
              size="sm"
              onClick={props.onOpenBulkMapping}
              class="shrink-0"
            >
              <IconLink class="min-[1670px]:mr-2 h-4 w-4" />
              <span class="hidden min-[1670px]:inline">Map Episodes</span>
            </TooltipTrigger>
            <TooltipContent>Manual Map Episodes</TooltipContent>
          </Tooltip>

          <Link
            to="/logs"
            search={{
              download_anime_id: String(props.animeId),
              download_cursor: "",
              download_direction: "next",
              download_download_id: "",
              download_end_date: "",
              download_event_type: "all",
              download_start_date: "",
              download_status: "",
            }}
            class="shrink-0"
          >
            <Button variant="outline" size="sm">
              <IconList class="min-[1670px]:mr-2 h-4 w-4" />
              <span class="hidden min-[1670px]:inline">Events</span>
            </Button>
          </Link>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger
                as={AlertDialogTrigger}
                variant="ghost"
                size="icon"
                class="text-muted-foreground hover:text-destructive shrink-0 h-9 w-9"
              >
                <IconTrash class="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Delete Anime</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Anime?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove "{props.anime.title.english || props.anime.title.romaji}" from
                  your library. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={props.onDeleteAnime}
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
