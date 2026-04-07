import {
  IconDeviceTv,
  IconFilter,
  IconFolder,
  IconFolderOpen,
  IconGridDots,
  IconList,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-solidjs";
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import * as v from "valibot";
import { AnimeListSkeleton } from "~/components/anime-list-skeleton";
import { DeleteAnimeDialog } from "~/components/delete-anime-dialog";
import { GeneralError } from "~/components/general-error";
import { Badge } from "~/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  type Anime,
  animeListQueryOptions,
  createDeleteAnimeMutation,
  createSystemConfigQuery,
  systemConfigQueryOptions,
} from "~/lib/api";
import { createDebouncer } from "~/lib/debounce";
import {
  animeDateSubtitle,
  formatNextAiringEpisode,
  getAiringDisplayPreferences,
} from "~/lib/anime-metadata";
import { filterAnimeLibrary } from "~/lib/anime-library-filter";
import { cn } from "~/lib/utils";

const MonitorFilterSchema = v.fallback(v.picklist(["all", "monitored", "unmonitored"]), "all");

const ViewModeSchema = v.fallback(v.picklist(["grid", "list"]), "grid");

const AnimeSearchSchema = v.object({
  q: v.optional(v.string(), ""),
  filter: v.optional(MonitorFilterSchema, "all"),
  view: v.optional(ViewModeSchema, "grid"),
});

export const Route = createFileRoute("/_layout/anime/")({
  validateSearch: (search) => {
    const stored = (() => {
      if (typeof window === "undefined") return {};
      try {
        const item = localStorage.getItem("bakarr_anime_search");
        return item ? JSON.parse(item) : {};
      } catch {
        return {};
      }
    })();
    return v.parse(AnimeSearchSchema, { ...stored, ...search });
  },
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
  const deleteAnime = createDeleteAnimeMutation();
  const animeQuery = useQuery(animeListQueryOptions);
  const configQuery = createSystemConfigQuery();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const airingPreferences = createMemo(() =>
    getAiringDisplayPreferences(configQuery.data?.library),
  );

  const [localQuery, setLocalQuery] = createSignal(search().q);

  // Sync localQuery only when URL search param changes (e.g. browser back/forward).
  // Avoid tracking localQuery here so typing is not overwritten before debounce commits.
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
      const currentSearch = search();
      localStorage.setItem("bakarr_anime_search", JSON.stringify(currentSearch));
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

  const libraryIds = createMemo(() => new Set(filteredList().map((item) => item.id)));

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
              onInput={(e) => handleSearchInput(e.currentTarget.value)}
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
                libraryIds={libraryIds()}
              />
            }
          >
            <AnimeGridView
              anime={filteredList()}
              airingPreferences={airingPreferences()}
              deleteAnime={deleteAnime}
              libraryIds={libraryIds()}
            />
          </Show>
        </Show>
      </Show>
    </div>
  );
}

interface AnimeViewProps {
  anime: Anime[];
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  deleteAnime: ReturnType<typeof createDeleteAnimeMutation>;
  libraryIds: ReadonlySet<number>;
}

function getColCount() {
  const w = globalThis.innerWidth;
  if (w >= 1536) return 6;
  if (w >= 1280) return 5;
  if (w >= 1024) return 4;
  if (w >= 640) return 3;
  return 2;
}

function progressPercent(anime: Anime) {
  return anime.progress.downloaded_percent ?? null;
}

function progressSummary(anime: Anime) {
  const total = anime.progress.total;
  const percent = anime.progress.downloaded_percent;

  if (total) {
    return percent !== undefined
      ? `${anime.progress.downloaded}/${total} downloaded • ${percent}%`
      : `${anime.progress.downloaded}/${total} downloaded`;
  }

  return `${anime.progress.downloaded} downloaded`;
}

function nextProgressLabel(anime: Anime) {
  if (anime.progress.is_up_to_date) {
    return "Up to date";
  }

  if (anime.progress.next_missing_episode) {
    return `Next missing: Ep ${anime.progress.next_missing_episode}`;
  }

  if (anime.progress.latest_downloaded_episode) {
    return `Latest: Ep ${anime.progress.latest_downloaded_episode}`;
  }

  return anime.progress.downloaded > 0 ? "Episodes available" : "No downloads yet";
}

function statusTone(anime: Anime) {
  if (anime.next_airing_episode) return "success" as const;
  if (anime.progress.is_up_to_date) return "secondary" as const;
  if (anime.progress.next_missing_episode) return "warning" as const;
  return anime.monitored ? ("outline" as const) : ("secondary" as const);
}

function AnimeGridView(props: AnimeViewProps) {
  let scrollRef: HTMLDivElement | undefined;
  const [colCount, setColCount] = createSignal(getColCount());

  onMount(() => {
    let rafId: number;
    const handler = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setColCount(getColCount()));
    };
    globalThis.addEventListener("resize", handler);
    onCleanup(() => {
      globalThis.removeEventListener("resize", handler);
      cancelAnimationFrame(rafId);
    });
  });

  const rowCount = createMemo(() => Math.ceil(props.anime.length / colCount()));

  const estimateRowSize = createMemo(() => {
    const cols = colCount();
    const vw = globalThis.innerWidth;
    const containerW = Math.max(280, vw - (vw >= 768 ? 260 : 0) - 48);
    const colW = (containerW - (cols - 1) * 16) / cols;
    return Math.round(colW * 1.5 + 68 + 16); // image + card content + row gap
  });

  const rowVirtualizer = createVirtualizer({
    get count() {
      return rowCount();
    },
    estimateSize: () => estimateRowSize(),
    overscan: 2,
    getScrollElement: () => scrollRef ?? null,
  });

  const gridPaddingTop = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });
  const gridPaddingBottom = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? rowVirtualizer.getTotalSize() - last.end : 0;
  });

  // Flatten virtual rows into individual anime items for reactive rendering.
  // Using Index instead of nested For to ensure items re-render when the
  // backing anime array changes (the nested For approach cached stale data).
  const visibleItems = createMemo(() => {
    const items: Array<{ anime: Anime; key: number }> = [];
    const cols = colCount();
    for (const vRow of rowVirtualizer.getVirtualItems()) {
      const startIdx = vRow.index * cols;
      const rowSlice = props.anime.slice(startIdx, startIdx + cols);
      for (const anime of rowSlice) {
        items.push({ anime, key: anime.id });
      }
    }
    return items;
  });

  return (
    <div
      ref={(el) => {
        scrollRef = el;
      }}
      class="overflow-y-auto flex-1 min-h-0"
      style={{ "overflow-anchor": "none" }}
    >
      <div style={{ height: `${gridPaddingTop()}px` }} aria-hidden="true" />
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pb-4">
        <For each={visibleItems()} fallback={null}>
          {(item) => {
            const anime = item.anime;
            return (
              <Card class="group relative flex flex-col overflow-hidden bg-card card-hover transition-colors">
                <div class="relative aspect-[2/3] w-full overflow-hidden bg-muted border-b border-border">
                  <Link
                    to="/anime/$id"
                    params={{ id: anime.id.toString() }}
                    class="block h-full w-full"
                  >
                    <Show
                      when={anime.cover_image}
                      fallback={
                        <div class="flex h-full items-center justify-center text-muted-foreground">
                          <IconDeviceTv class="h-12 w-12 opacity-20" />
                        </div>
                      }
                    >
                      <img
                        src={anime.cover_image}
                        alt={anime.title.english || anime.title.romaji}
                        loading="lazy"
                        class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </Show>
                    <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </Link>
                  <div class="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                    <DeleteAnimeDialog
                      title={anime.title.english || anime.title.romaji}
                      onConfirm={() => props.deleteAnime.mutate(anime.id)}
                      trigger={
                        <Button
                          size="icon"
                          variant="secondary"
                          class="relative after:absolute after:-inset-3 h-8 w-8 shadow-sm bg-background/90 hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <IconTrash class="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </div>
                </div>
                <div class="flex flex-1 flex-col gap-2 p-3">
                  <Link
                    to="/anime/$id"
                    params={{ id: anime.id.toString() }}
                    class="line-clamp-1 text-sm font-medium leading-tight text-foreground/90 transition-colors hover:text-primary"
                    title={anime.title.english || anime.title.romaji}
                  >
                    {anime.title.english || anime.title.romaji}
                  </Link>
                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant={statusTone(anime)} class="h-5 rounded-sm px-1.5 font-normal">
                        {anime.next_airing_episode
                          ? "Airing"
                          : anime.monitored
                            ? "Monitored"
                            : "Unmonitored"}
                      </Badge>
                      <Show when={animeDateSubtitle(anime)}>
                        <span>{animeDateSubtitle(anime)}</span>
                      </Show>
                    </div>
                    <div class="space-y-1">
                      <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{progressSummary(anime)}</span>
                        <Show when={progressPercent(anime) !== null}>
                          <span>{progressPercent(anime)}%</span>
                        </Show>
                      </div>
                      <div class="h-1.5 overflow-hidden bg-muted">
                        <div
                          class={cn(
                            "h-full transition-[width]",
                            anime.progress.next_missing_episode
                              ? "bg-warning"
                              : anime.monitored
                                ? "bg-primary"
                                : "bg-muted-foreground/40",
                          )}
                          style={{ width: `${progressPercent(anime) ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <div class="line-clamp-1 text-[11px] text-muted-foreground">
                      {formatNextAiringEpisode(
                        anime.next_airing_episode,
                        props.airingPreferences,
                      ) || nextProgressLabel(anime)}
                    </div>
                  </div>
                  <div class="mt-auto flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        class="h-5 rounded-sm border-border/50 px-1.5 text-xs font-normal text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                      >
                        {anime.profile_name}
                      </Badge>
                    </div>
                    <Tooltip>
                      <TooltipTrigger
                        as={Button}
                        variant="ghost"
                        class="p-1 -mr-1 h-auto hover:bg-muted/50 transition-colors rounded-full"
                      >
                        <div class="flex items-center gap-1.5">
                          <div
                            class={cn(
                              "h-1.5 w-1.5 rounded-full",
                              anime.monitored
                                ? "bg-success shadow-[0_0_4px_hsl(var(--success)/0.4)]"
                                : "bg-muted-foreground/40",
                            )}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {anime.monitored ? "Monitored" : "Unmonitored"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </Card>
            );
          }}
        </For>
      </div>
      <div style={{ height: `${gridPaddingBottom()}px` }} aria-hidden="true" />
    </div>
  );
}

function AnimeListView(props: AnimeViewProps) {
  let scrollRef: HTMLDivElement | undefined;
  const rowVirtualizer = createVirtualizer({
    get count() {
      return props.anime.length;
    },
    estimateSize: () => 72,
    getScrollElement: () => scrollRef ?? null,
    overscan: 10,
  });

  const paddingTop = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });
  const paddingBottom = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? rowVirtualizer.getTotalSize() - last.end : 0;
  });

  return (
    <div
      ref={(el) => {
        scrollRef = el;
      }}
      class="flex-1 min-h-0 overflow-y-auto rounded-md border"
      style={{ "overflow-anchor": "none" }}
    >
      <Table>
        <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
          <TableRow class="hover:bg-transparent border-none">
            <TableHead class="w-[80px]">Cover</TableHead>
            <TableHead>Title</TableHead>
            <TableHead class="hidden lg:table-cell">Schedule</TableHead>
            <TableHead class="hidden md:table-cell">Progress</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <tr aria-hidden="true">
            <td
              colSpan={6}
              style={{
                height: `${paddingTop()}px`,
                padding: "0",
                border: "none",
              }}
            />
          </tr>
          <For each={rowVirtualizer.getVirtualItems()}>
            {(vRow) => {
              const anime = props.anime[vRow.index];
              if (!anime) {
                return null;
              }
              return (
                <TableRow>
                  <TableCell>
                    <Link
                      to="/anime/$id"
                      params={{ id: anime.id.toString() }}
                      class="block w-12 h-16 overflow-hidden bg-muted"
                    >
                      <Show
                        when={anime.cover_image}
                        fallback={
                          <div class="flex items-center justify-center h-full text-muted-foreground">
                            <IconDeviceTv class="h-6 w-6" />
                          </div>
                        }
                      >
                        <img
                          src={anime.cover_image}
                          alt={anime.title.english || anime.title.romaji}
                          loading="lazy"
                          class="w-full h-full object-cover"
                        />
                      </Show>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to="/anime/$id" params={{ id: anime.id.toString() }} class="block group">
                      <div class="font-medium group-hover:text-primary transition-colors">
                        {anime.title.english || anime.title.romaji}
                      </div>
                      <div class="text-xs text-muted-foreground">{anime.profile_name}</div>
                      <div class="text-xs text-muted-foreground mt-1">
                        {animeDateSubtitle(anime) || "No date metadata"}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell class="hidden lg:table-cell">
                    <div class="text-sm">
                      {formatNextAiringEpisode(
                        anime.next_airing_episode,
                        props.airingPreferences,
                      ) || "No upcoming airing"}
                    </div>
                  </TableCell>
                  <TableCell class="hidden md:table-cell">
                    <div class="space-y-1">
                      <div class="text-sm">{progressSummary(anime)}</div>
                      <div class="text-xs text-muted-foreground">{nextProgressLabel(anime)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="flex flex-col items-start gap-1">
                      <div class="flex items-center gap-2">
                        <div
                          class={`h-2 w-2 rounded-full ${
                            anime.monitored ? "bg-success" : "bg-warning"
                          }`}
                        />
                        <span class="text-sm">{anime.monitored ? "Monitored" : "Unmonitored"}</span>
                      </div>
                      <Show when={anime.next_airing_episode}>
                        <Badge variant="success" class="px-1.5 py-0 text-xs">
                          Airing
                        </Badge>
                      </Show>
                    </div>
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex items-center justify-end gap-1">
                      <DeleteAnimeDialog
                        title={anime.title.english || anime.title.romaji}
                        onConfirm={() => props.deleteAnime.mutate(anime.id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            class="relative after:absolute after:-inset-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e: Event) => e.stopPropagation()}
                          >
                            <IconTrash class="h-4 w-4" />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            }}
          </For>
          <tr aria-hidden="true">
            <td
              colSpan={6}
              style={{
                height: `${paddingBottom()}px`,
                padding: "0",
                border: "none",
              }}
            />
          </tr>
        </TableBody>
      </Table>
    </div>
  );
}
