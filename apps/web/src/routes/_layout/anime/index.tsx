import {
  TelevisionIcon,
  FunnelIcon,
  FolderIcon,
  FolderOpenIcon,
  SquaresFourIcon,
  ListIcon,
  PlusIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useDeferredValue, useTransition } from "react";
import * as v from "valibot";
import { AnimeListSkeleton } from "~/components/anime-list-skeleton";
import { EmptyState } from "~/components/empty-state";
import { GeneralError } from "~/components/general-error";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  animeListQueryOptions,
  createDeleteAnimeMutation,
  systemConfigQueryOptions,
} from "~/lib/api";
import { filterAnimeLibrary } from "~/lib/anime-library-filter";
import { getAiringDisplayPreferences } from "~/lib/anime-metadata";
import { usePageTitle } from "~/lib/page-title";
import { cn } from "~/lib/utils";

const AnimeGridViewLazy = lazy(() =>
  import("~/components/anime/anime-library-views").then((module) => ({
    default: module.AnimeGridView,
  })),
);
const AnimeListViewLazy = lazy(() =>
  import("~/components/anime/anime-library-views").then((module) => ({
    default: module.AnimeListView,
  })),
);

const MonitorFilterSchema = v.fallback(v.picklist(["all", "monitored", "unmonitored"]), "all");

const ViewModeSchema = v.fallback(v.picklist(["grid", "list"]), "grid");

const DEFAULT_ANIME_SEARCH = {
  filter: "all",
  q: "",
  view: "grid",
} as const;

type MonitorFilter = typeof DEFAULT_ANIME_SEARCH.filter | "monitored" | "unmonitored";

const MONITOR_FILTER_VALUES = new Set<string>(["all", "monitored", "unmonitored"]);

function isMonitorFilter(value: string): value is MonitorFilter {
  return MONITOR_FILTER_VALUES.has(value);
}

const AnimeSearchSchema = v.object({
  q: v.optional(v.string(), DEFAULT_ANIME_SEARCH.q),
  filter: v.optional(MonitorFilterSchema, DEFAULT_ANIME_SEARCH.filter),
  view: v.optional(ViewModeSchema, DEFAULT_ANIME_SEARCH.view),
});

export const Route = createFileRoute("/_layout/anime/")({
  validateSearch: (search) => v.parse(AnimeSearchSchema, search),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(animeListQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
  },
  component: AnimeIndexPage,
  errorComponent: GeneralError,
});

function AnimeIndexPage() {
  usePageTitle("Library");
  const deleteAnime = createDeleteAnimeMutation();
  const anime = useSuspenseQuery(animeListQueryOptions()).data;
  const systemConfig = useSuspenseQuery(systemConfigQueryOptions()).data;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const airingPreferences = getAiringDisplayPreferences(systemConfig.library);

  const [, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(search.q);

  const handleSearchInput = (q: string) => {
    startTransition(() => {
      void navigate({
        to: ".",
        search: { q, filter: search.filter, view: search.view },
        replace: true,
      });
    });
  };

  const filteredList = filterAnimeLibrary(anime, deferredQuery, search.filter);

  const updateFilter = (filter: MonitorFilter) =>
    void navigate({
      to: ".",
      search: {
        q: search.q,
        filter,
        view: search.view,
      },
      replace: true,
    });

  const updateView = (view: "grid" | "list") =>
    void navigate({
      to: ".",
      search: {
        q: search.q,
        filter: search.filter,
        view,
      },
      replace: true,
    });

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="border-b border-border pb-3 mb-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredList.length === anime.length
                ? `${anime.length} titles`
                : `${filteredList.length} of ${anime.length} titles`}
            </p>
          </div>
          <Link
            to="/anime/add"
            className={buttonVariants({ class: "gap-1.5 px-2.5 sm:px-4" })}
            aria-label="Add anime"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Add Anime</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter anime..."
              aria-label="Filter anime"
              value={search.q}
              onInput={(event) => handleSearchInput(event.currentTarget.value)}
              className="pl-9"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" />}
              aria-label="Filter by status"
            >
              <FunnelIcon className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={search.filter}
                onValueChange={(value) => {
                  if (isMonitorFilter(value)) {
                    updateFilter(value);
                  }
                }}
              >
                <DropdownMenuRadioItem value="all">All Anime</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="monitored">Monitored</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unmonitored">Unmonitored</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-6 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger>
              <Link
                to="/anime/import"
                className={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label="Import from folder"
              >
                <FolderOpenIcon className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Import from folder</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Link
                to="/anime/scan"
                className={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label="Scan library"
              >
                <FolderIcon className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Scan library</TooltipContent>
          </Tooltip>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-1 bg-muted p-1">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "relative after:absolute after:-inset-2 h-7 w-7",
                    search.view === "grid" ? "bg-background " : "hover:bg-background",
                  )}
                  aria-label="Grid view"
                  onClick={() => updateView("grid")}
                >
                  <SquaresFourIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "relative after:absolute after:-inset-2 h-7 w-7",
                    search.view === "list" ? "bg-background " : "hover:bg-background",
                  )}
                  aria-label="List view"
                  onClick={() => updateView("list")}
                >
                  <ListIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {filteredList.length > 0 ? (
          <Suspense fallback={<AnimeListSkeleton />}>
            {search.view === "grid" ? (
              <AnimeGridViewLazy
                anime={filteredList}
                airingPreferences={airingPreferences}
                deleteAnime={deleteAnime}
              />
            ) : (
              <AnimeListViewLazy
                anime={filteredList}
                airingPreferences={airingPreferences}
                deleteAnime={deleteAnime}
              />
            )}
          </Suspense>
        ) : !search.q && search.filter === "all" ? (
          <EmptyState
            icon={<TelevisionIcon className="h-12 w-12" />}
            title="No anime yet"
            description="Add your first anime to start monitoring"
          >
            <Link to="/anime/add" className={buttonVariants()}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Anime
            </Link>
          </EmptyState>
        ) : (
          <EmptyState
            title={search.q ? `No anime matching "${search.q}"` : `No ${search.filter} anime found`}
          />
        )}
      </div>
    </div>
  );
}
