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
import { Suspense, lazy, useDeferredValue } from "react";
import { Schema } from "effect";
import { AnimeListSkeleton } from "~/features/anime/anime-list-skeleton";
import { EmptyState } from "~/components/shared/empty-state";
import { GeneralError } from "~/components/shared/general-error";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { animeListQueryOptions } from "~/api/anime";
import { useDeleteAnimeMutation } from "~/api/anime-mutations";
import { systemConfigQueryOptions } from "~/api/system-config";
import { filterAnimeLibrary } from "~/domain/anime/library-filter";
import { getAiringDisplayPreferences } from "~/domain/anime/metadata";
import { usePageTitle } from "~/domain/page-title";
import { cn } from "~/infra/utils";

const AnimeGridViewLazy = lazy(() =>
  import("~/features/anime/anime-library-views").then((module) => ({
    default: module.AnimeGridView,
  })),
);
const AnimeListViewLazy = lazy(() =>
  import("~/features/anime/anime-library-views").then((module) => ({
    default: module.AnimeListView,
  })),
);

const MonitorFilterSchema = Schema.transform(
  Schema.String,
  Schema.Literal("all", "monitored", "unmonitored"),
  {
    decode: (s) => (s === "monitored" ? "monitored" : s === "unmonitored" ? "unmonitored" : "all"),
    encode: (s) => s,
  },
);

const ViewModeSchema = Schema.transform(Schema.String, Schema.Literal("grid", "list"), {
  decode: (s) => (s === "list" ? "list" : "grid"),
  encode: (s) => s,
});

const DEFAULT_ANIME_SEARCH = {
  filter: "all",
  q: "",
  view: "grid",
} as const;

type MonitorFilter = Schema.Schema.Type<typeof MonitorFilterSchema>;

const isMonitorFilter = Schema.is(MonitorFilterSchema);

const AnimeSearchSchema = Schema.Struct({
  q: Schema.optional(Schema.String),
  filter: Schema.optional(MonitorFilterSchema),
  view: Schema.optional(ViewModeSchema),
});

export const Route = createFileRoute("/_layout/anime/")({
  validateSearch: Schema.standardSchemaV1(AnimeSearchSchema),
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
  const deleteAnime = useDeleteAnimeMutation();
  const anime = useSuspenseQuery(animeListQueryOptions()).data;
  const systemConfig = useSuspenseQuery(systemConfigQueryOptions()).data;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const airingPreferences = getAiringDisplayPreferences(systemConfig.library);

  const query = search.q ?? DEFAULT_ANIME_SEARCH.q;
  const filter = search.filter ?? DEFAULT_ANIME_SEARCH.filter;
  const view = search.view ?? DEFAULT_ANIME_SEARCH.view;
  const deferredQuery = useDeferredValue(query);

  const handleSearchInput = (q: string) => {
    void navigate({
      to: ".",
      search: { q, filter, view },
      replace: true,
    });
  };

  const filteredList = filterAnimeLibrary(anime, deferredQuery, filter);

  const updateFilter = (nextFilter: MonitorFilter) =>
    void navigate({
      to: ".",
      search: {
        q: query,
        filter: nextFilter,
        view,
      },
      replace: true,
    });

  const updateView = (nextView: "grid" | "list") =>
    void navigate({
      to: ".",
      search: {
        q: query,
        filter,
        view: nextView,
      },
      replace: true,
    });

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Library</h1>
            <p className="text-xs text-muted-foreground">
              {filteredList.length === anime.length
                ? `${anime.length} titles`
                : `${filteredList.length} of ${anime.length} titles`}
            </p>
          </div>
          <Link
            to="/anime/add"
            className={buttonVariants({ size: "sm", class: "gap-1.5 shrink-0" })}
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
              value={query}
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
                value={filter}
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

          <Separator orientation="vertical" className="h-6" />

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

          <Separator orientation="vertical" className="h-6" />

          <div className="flex items-center gap-1 bg-muted p-1">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "relative after:absolute after:-inset-2 h-7 w-7",
                    view === "grid" ? "bg-background " : "hover:bg-background",
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
                    view === "list" ? "bg-background " : "hover:bg-background",
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

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {filteredList.length > 0 ? (
          <Suspense
            fallback={
              <div className="flex-1 overflow-y-auto">
                <AnimeListSkeleton />
              </div>
            }
          >
            {view === "grid" ? (
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
        ) : !query && filter === "all" ? (
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              icon={<TelevisionIcon className="h-12 w-12" />}
              title="No anime yet"
              description="Add your first anime to start monitoring"
              className="border-dashed"
            >
              <Link to="/anime/add" className={buttonVariants()}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Anime
              </Link>
            </EmptyState>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              title={query ? `No anime matching "${query}"` : `No ${filter} anime found`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
