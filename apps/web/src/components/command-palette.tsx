import {
  IconChevronRight,
  IconCommand,
  IconExternalLink,
  IconInfoCircle,
  IconPlus,
  IconSearch,
} from "@tabler/icons-solidjs";
import { useNavigate } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  Suspense,
} from "solid-js";
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import { AnimeDiscoveryPopover } from "~/components/anime-discovery";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "~/components/ui/command";
import { Skeleton } from "~/components/ui/skeleton";
import {
  type AnimeSearchResult,
  createAnimeListQuery,
  createAnimeSearchQuery,
} from "~/lib/api";
import { animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { formatMatchConfidence } from "~/lib/scanned-file";

// Separate component for the search results to isolate re-renders
function SearchResults(props: {
  inputValue: () => string;
  debouncedSearch: () => string;
  animeList: ReturnType<typeof createAnimeListQuery>;
  anilistSearch: ReturnType<typeof createAnimeSearchQuery>;
  onSelect: (path: string) => void;
  onAddAnime: (anime: AnimeSearchResult) => void;
  onOpenAddPage: (animeId: number) => void;
}) {
  // Filter library anime based on search - uses input value for instant feedback
  const filteredLibrary = createMemo(() => {
    const query = props.inputValue().toLowerCase().trim();
    const data = props.animeList.data;

    if (!data) return [];
    if (!query) return data.slice(0, 10);

    return data
      .filter((anime) => {
        const title = anime.title.romaji?.toLowerCase() || "";
        const english = anime.title.english?.toLowerCase() || "";
        const native = anime.title.native?.toLowerCase() || "";
        return (
          title.includes(query) ||
          english.includes(query) ||
          native.includes(query)
        );
      })
      .slice(0, 10);
  });
  const libraryIds = createMemo(() =>
    new Set((props.animeList.data ?? []).map((anime) => anime.id))
  );
  const anilistResults = createMemo(() =>
    props.anilistSearch.data?.results ?? []
  );
  const anilistSearchDegraded = createMemo(() =>
    props.anilistSearch.data?.degraded ?? false
  );

  return (
    <CommandList>
      <Suspense
        fallback={
          <CommandEmpty>
            <div class="flex items-center justify-center py-4">
              <Skeleton class="h-4 w-32" />
            </div>
          </CommandEmpty>
        }
      >
        {/* Show loading state */}
        <Show when={props.animeList.isLoading}>
          <CommandEmpty>Loading library...</CommandEmpty>
        </Show>

        {/* Show no results when library is empty */}
        <Show
          when={!props.animeList.isLoading && filteredLibrary().length === 0}
        >
          <CommandEmpty>
            <Show
              when={props.debouncedSearch().length >= 3 &&
                !props.anilistSearch.isLoading &&
                !anilistSearchDegraded()}
            >
              No results in library. Check AniList results below.
            </Show>
            <Show
              when={props.debouncedSearch().length >= 3 &&
                anilistSearchDegraded()}
            >
              No results in library. AniList is rate-limited, so only local
              matches are shown.
            </Show>
            <Show when={props.debouncedSearch().length < 3}>
              No anime found in library.
            </Show>
            <Show when={props.anilistSearch.isLoading}>
              Searching AniList...
            </Show>
          </CommandEmpty>
        </Show>

        {/* Library Section */}
        <Show when={!props.animeList.isLoading && filteredLibrary().length > 0}>
          <CommandGroup heading="Library">
            <For each={filteredLibrary()}>
              {(anime) => (
                <CommandItem
                  value={`library-${anime.id}`}
                  onSelect={() => props.onSelect(`/anime/${anime.id}`)}
                >
                  <Show when={anime.cover_image}>
                    <img
                      src={anime.cover_image}
                      alt=""
                      class="mr-2 h-8 w-6 object-cover"
                    />
                  </Show>
                  <div class="flex flex-col">
                    <span class="font-medium">{anime.title.romaji}</span>
                    <Show
                      when={anime.title.english &&
                        anime.title.english !== anime.title.romaji}
                    >
                      <span class="text-xs text-muted-foreground">
                        {anime.title.english}
                      </span>
                    </Show>
                    <Show
                      when={animeSearchSubtitle(anime) || anime.genres?.length}
                    >
                      <span class="text-xs text-muted-foreground">
                        {[animeSearchSubtitle(anime), anime.genres?.[0]]
                          .filter((value): value is string => Boolean(value))
                          .join(" • ")}
                      </span>
                    </Show>
                  </div>
                  <IconChevronRight class="ml-auto h-4 w-4 text-muted-foreground" />
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </Show>

        {/* AniList Search Section - for adding new anime */}
        <Show
          when={props.debouncedSearch().length >= 3 && anilistSearchDegraded()}
        >
          <CommandSeparator />
          <CommandGroup heading="Search Mode">
            <CommandItem value="anilist-degraded" disabled>
              <IconInfoCircle class="mr-2 h-4 w-4" />
              AniList is rate-limited. Showing local matches only.
            </CommandItem>
          </CommandGroup>
        </Show>
        <Show
          when={props.debouncedSearch().length >= 3 &&
            anilistResults().length > 0}
        >
          <CommandSeparator />
          <CommandGroup heading="AniList - Add New Anime">
            <For
              each={anilistResults()
                ?.filter((a) => !a.already_in_library)
                .slice(0, 5)}
            >
              {(anime) => (
                <CommandItem
                  value={`anilist-${anime.id}`}
                  onSelect={() => props.onAddAnime(anime)}
                >
                  <Show when={anime.cover_image}>
                    <img
                      src={anime.cover_image}
                      alt=""
                      class="mr-2 h-8 w-6 object-cover"
                    />
                  </Show>
                  <div class="flex flex-col">
                    <span class="font-medium">{animeDisplayTitle(anime)}</span>
                    <Show
                      when={anime.title.english &&
                        anime.title.english !== anime.title.romaji}
                    >
                      <span class="text-xs text-muted-foreground">
                        {anime.title.english}
                      </span>
                    </Show>
                    <Show
                      when={animeSearchSubtitle(anime) ||
                        formatMatchConfidence(anime.match_confidence)}
                    >
                      <span class="text-xs text-muted-foreground">
                        {[
                          animeSearchSubtitle(anime),
                          formatMatchConfidence(anime.match_confidence),
                        ]
                          .filter((value): value is string => Boolean(value))
                          .join(" • ")}
                      </span>
                    </Show>
                    <Show when={anilistSearchDegraded()}>
                      <span class="text-xs text-warning">
                        Local only
                      </span>
                    </Show>
                    <Show when={anime.match_reason}>
                      <span class="max-w-[18rem] truncate text-xs text-muted-foreground">
                        {anime.match_reason}
                      </span>
                    </Show>
                  </div>
                  <div class="ml-auto flex items-center gap-1">
                    <AnimeDiscoveryPopover
                      animeId={anime.id}
                      libraryIds={libraryIds()}
                      triggerClass="h-8 w-8"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      class="h-8 px-2 text-xs"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        props.onOpenAddPage(anime.id);
                      }}
                    >
                      <IconPlus class="h-3 w-3" />
                      Add
                    </Button>
                    <IconExternalLink class="h-4 w-4 text-muted-foreground" />
                  </div>
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </Show>
      </Suspense>
    </CommandList>
  );
}

export function CommandPalette() {
  const [open, setOpen] = createSignal(false);
  const [inputValue, setInputValue] = createSignal("");
  const [debouncedSearch, setDebouncedSearch] = createSignal("");
  const [selectedAnimeForAdd, setSelectedAnimeForAdd] = createSignal<
    AnimeSearchResult | null
  >(null);
  const navigate = useNavigate();

  // Keyboard shortcut to open command palette
  createEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  // Debounce search input to prevent excessive re-renders
  createEffect(() => {
    const value = inputValue();
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 150);
    onCleanup(() => clearTimeout(timeout));
  });

  // Fetch library anime - fetch once and don't track updates while dialog is open
  const animeList = createAnimeListQuery();

  // Fetch AniList search for adding new anime - uses debounced value
  const anilistSearch = createAnimeSearchQuery(() => debouncedSearch());

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate({ to: path });
  };

  const handleAddAnime = (anime: AnimeSearchResult) => {
    setSelectedAnimeForAdd(anime);
  };
  const handleOpenAddPage = (animeId: number) => {
    setOpen(false);
    navigate({ to: "/anime/add", search: { id: animeId.toString() } });
  };

  const handleAddSuccess = () => {
    setSelectedAnimeForAdd(null);
    setOpen(false);
  };

  return (
    <>
      {/* Search Button in Header - Static, never re-renders */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        class="flex items-center gap-2 rounded-none border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <IconSearch class="h-4 w-4 shrink-0" />
        <span class="hidden md:inline">Search...</span>
        <kbd class="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
          <IconCommand class="h-2.5 w-2.5" />K
        </kbd>
      </button>

      {/* Dialog with isolated rendering */}
      <CommandDialog open={open()} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search library or add anime..."
            value={inputValue()}
            onValueChange={setInputValue}
            class="focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-0"
          />
          <SearchResults
            inputValue={inputValue}
            debouncedSearch={debouncedSearch}
            animeList={animeList}
            anilistSearch={anilistSearch}
            onSelect={handleSelect}
            onAddAnime={handleAddAnime}
            onOpenAddPage={handleOpenAddPage}
          />
        </Command>
      </CommandDialog>

      {/* Add Anime Dialog - opens inline without navigating */}
      <Show when={selectedAnimeForAdd()}>
        <AddAnimeDialog
          anime={selectedAnimeForAdd()!}
          open={!!selectedAnimeForAdd()}
          onOpenChange={(open) => !open && setSelectedAnimeForAdd(null)}
          onSuccess={handleAddSuccess}
        />
      </Show>
    </>
  );
}
