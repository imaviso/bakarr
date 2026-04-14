import {
  IconDeviceTv,
  IconFilter,
  IconFolder,
  IconFolderOpen,
  IconGridDots,
  IconList,
  IconPlus,
  IconSearch,
} from "@tabler/icons-solidjs";
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import * as v from "valibot";
import { AnimeListSkeleton } from "~/components/anime-list-skeleton";
import { AnimeGridView, AnimeListView } from "~/components/anime/anime-library-views";
import { GeneralError } from "~/components/general-error";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
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
  createSystemConfigQuery,
  systemConfigQueryOptions,
} from "~/lib/api";
import { filterAnimeLibrary } from "~/lib/anime-library-filter";
import { getAiringDisplayPreferences } from "~/lib/anime-metadata";
import { createDebouncer } from "~/lib/debounce";
import { usePageTitle } from "~/lib/page-title";
import { cn } from "~/lib/utils";

const MonitorFilterSchema = v.fallback(v.picklist(["all", "monitored", "unmonitored"]), "all");

const ViewModeSchema = v.fallback(v.picklist(["grid", "list"]), "grid");

const DEFAULT_ANIME_SEARCH = {
  filter: "all",
  q: "",
  view: "grid",
} as const;

const AnimeSearchSchema = v.object({
  q: v.optional(v.string(), DEFAULT_ANIME_SEARCH.q),
  filter: v.optional(MonitorFilterSchema, DEFAULT_ANIME_SEARCH.filter),
  view: v.optional(ViewModeSchema, DEFAULT_ANIME_SEARCH.view),
});

const StoredAnimeSearchSchema = v.object({
  q: v.optional(v.string()),
  filter: v.optional(v.picklist(["all", "monitored", "unmonitored"])),
  view: v.optional(v.picklist(["grid", "list"])),
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
  usePageTitle(() => "Library");
  const deleteAnime = createDeleteAnimeMutation();
  const animeQuery = useQuery(animeListQueryOptions);
  const configQuery = createSystemConfigQuery();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const airingPreferences = createMemo(() =>
    getAiringDisplayPreferences(configQuery.data?.library),
  );

  const [localQuery, setLocalQuery] = createSignal(search().q);

  onMount(() => {
    const stored = readStoredAnimeSearch();

    if (!stored) {
      return;
    }

    const current = search();
    const isExplicitSearch =
      current.q !== DEFAULT_ANIME_SEARCH.q ||
      current.filter !== DEFAULT_ANIME_SEARCH.filter ||
      current.view !== DEFAULT_ANIME_SEARCH.view;

    if (isExplicitSearch) {
      return;
    }

    const next = {
      filter: stored.filter ?? current.filter,
      q: stored.q ?? current.q,
      view: stored.view ?? current.view,
    };

    if (next.q === current.q && next.filter === current.filter && next.view === current.view) {
      return;
    }

    void navigate({
      to: ".",
      search: next,
      replace: true,
    });
  });

  createEffect(
    on(
      () => search().q,
      (urlQ) => {
        setLocalQuery((current) => (current === urlQ ? current : urlQ));
      },
    ),
  );

  const debouncer = createDebouncer((q: string) => {
    void navigate({
      to: ".",
      search: {
        q,
        filter: search().filter,
        view: search().view,
      },
      replace: true,
    });
  }, 250);

  createEffect(() => {
    try {
      localStorage.setItem("bakarr_anime_search", JSON.stringify(search()));
    } catch {
      // Ignore persistence errors.
    }
  });

  onCleanup(() => debouncer.cancel());

  const handleSearchInput = (q: string) => {
    setLocalQuery(q);
    debouncer.schedule(q);
  };

  const filteredList = createMemo(() => {
    const list = animeQuery.data;
    if (!list) return [];
    return filterAnimeLibrary(list, localQuery(), search().filter);
  });

  const updateFilter = (filter: "all" | "monitored" | "unmonitored") =>
    void navigate({
      to: ".",
      search: {
        q: search().q,
        filter,
        view: search().view,
      },
      replace: true,
    });

  const updateView = (view: "grid" | "list") =>
    void navigate({
      to: ".",
      search: {
        q: search().q,
        filter: search().filter,
        view,
      },
      replace: true,
    });

  return (
    <div class="flex flex-col flex-1 min-h-0">
      <div class="border-b border-border pb-3 mb-3 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-foreground">Library</h1>
            <p class="text-sm text-muted-foreground mt-1">
              {filteredList().length === (animeQuery.data?.length ?? 0)
                ? `${animeQuery.data?.length ?? 0} titles`
                : `${filteredList().length} of ${animeQuery.data?.length ?? 0} titles`}
            </p>
          </div>
          <Link
            to="/anime/add"
            class={buttonVariants({ class: "gap-1.5 px-2.5 sm:px-4" })}
            aria-label="Add anime"
          >
            <IconPlus class="h-4 w-4" />
            <span class="hidden sm:inline">Add Anime</span>
          </Link>
        </div>

        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <IconSearch class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter anime..."
              aria-label="Filter anime"
              value={localQuery()}
              onInput={(event) => handleSearchInput(event.currentTarget.value)}
              class="pl-9"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              as={Button}
              variant="outline"
              size="icon"
              aria-label="Filter by status"
            >
              <IconFilter class="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={search().filter}
                onChange={(value) => updateFilter(value)}
              >
                <DropdownMenuRadioItem value="all">All Anime</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="monitored">Monitored</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unmonitored">Unmonitored</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div class="h-6 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger>
              <Link
                to="/anime/import"
                class={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label="Import from folder"
              >
                <IconFolderOpen class="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Import from folder</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Link
                to="/anime/scan"
                class={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label="Scan library"
              >
                <IconFolder class="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Scan library</TooltipContent>
          </Tooltip>

          <div class="h-6 w-px bg-border" />

          <div class="flex items-center gap-1 bg-muted/50 p-1">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  class={cn(
                    "relative after:absolute after:-inset-2 h-7 w-7",
                    search().view === "grid" ? "bg-background shadow-sm" : "hover:bg-background/50",
                  )}
                  aria-label="Grid view"
                  onClick={() => updateView("grid")}
                >
                  <IconGridDots class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  class={cn(
                    "relative after:absolute after:-inset-2 h-7 w-7",
                    search().view === "list" ? "bg-background shadow-sm" : "hover:bg-background/50",
                  )}
                  aria-label="List view"
                  onClick={() => updateView("list")}
                >
                  <IconList class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <Show when={!animeQuery.isLoading} fallback={<AnimeListSkeleton />}>
        <Show
          when={filteredList().length > 0}
          fallback={
            <Show
              when={!localQuery() && search().filter === "all"}
              fallback={
                <p class="text-center text-muted-foreground py-8">
                  {localQuery() ? (
                    <>No anime matching "{localQuery()}"</>
                  ) : (
                    `No ${search().filter} anime found`
                  )}
                </p>
              }
            >
              <Card class="p-12 text-center border-dashed">
                <div class="flex flex-col items-center gap-4">
                  <IconDeviceTv class="h-12 w-12 text-muted-foreground/50" />
                  <div>
                    <h2 class="font-medium">No anime yet</h2>
                    <p class="text-sm text-muted-foreground mt-1">
                      Add your first anime to start monitoring
                    </p>
                  </div>
                  <Link to="/anime/add" class={buttonVariants()}>
                    <IconPlus class="mr-2 h-4 w-4" />
                    Add Anime
                  </Link>
                </div>
              </Card>
            </Show>
          }
        >
          <Show
            when={search().view === "grid"}
            fallback={
              <AnimeListView
                anime={filteredList()}
                airingPreferences={airingPreferences()}
                deleteAnime={deleteAnime}
              />
            }
          >
            <AnimeGridView
              anime={filteredList()}
              airingPreferences={airingPreferences()}
              deleteAnime={deleteAnime}
            />
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function readStoredAnimeSearch() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = localStorage.getItem("bakarr_anime_search");

    if (!raw) {
      return;
    }

    return v.parse(StoredAnimeSearchSchema, JSON.parse(raw));
  } catch {
    return;
  }
}
