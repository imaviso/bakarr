import {
  IconCalendar,
  IconChevronRight,
  IconCommand,
  IconDeviceTv,
  IconDownload,
  IconHome,
  IconList,
  IconRss,
  IconSearch,
  IconSettings,
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
import { createAnimeListQuery } from "~/lib/api";
import { animeSearchSubtitle } from "~/lib/anime-metadata";

const navigationRoutes = [
  { title: "Dashboard", url: "/", icon: IconHome },
  { title: "Anime Library", url: "/anime", icon: IconDeviceTv },
  { title: "Add Anime", url: "/anime/add", icon: IconDeviceTv },
  { title: "RSS Feeds", url: "/rss", icon: IconRss },
  { title: "Wanted", url: "/wanted", icon: IconSearch },
  { title: "Calendar", url: "/calendar", icon: IconCalendar },
  { title: "Downloads", url: "/downloads", icon: IconDownload },
  { title: "System Logs", url: "/logs", icon: IconList },
  { title: "Settings", url: "/settings", icon: IconSettings },
];

function SearchResults(props: {
  inputValue: () => string;
  animeList: ReturnType<typeof createAnimeListQuery>;
  onSelect: (path: string) => void;
}) {
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

  const filteredRoutes = createMemo(() => {
    const query = props.inputValue().toLowerCase().trim();
    if (!query) return navigationRoutes;
    return navigationRoutes.filter((route) =>
      route.title.toLowerCase().includes(query)
    );
  });

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
        <Show when={props.animeList.isLoading}>
          <CommandEmpty>Loading library...</CommandEmpty>
        </Show>

        <Show
          when={!props.animeList.isLoading &&
            filteredLibrary().length === 0 &&
            filteredRoutes().length === 0}
        >
          <CommandEmpty>No results found.</CommandEmpty>
        </Show>

        {/* Navigation Routes */}
        <Show when={filteredRoutes().length > 0}>
          <CommandGroup heading="Navigation">
            <For each={filteredRoutes()}>
              {(route) => (
                <CommandItem
                  value={`nav-${route.url}`}
                  onSelect={() => props.onSelect(route.url)}
                >
                  <route.icon class="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{route.title}</span>
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </Show>

        {/* Library Section */}
        <Show when={!props.animeList.isLoading && filteredLibrary().length > 0}>
          <CommandSeparator />
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
                      alt={anime.title.romaji}
                      loading="lazy"
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
      </Suspense>
    </CommandList>
  );
}

export function CommandPalette() {
  const [open, setOpen] = createSignal(false);
  const [inputValue, setInputValue] = createSignal("");
  const navigate = useNavigate();

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

  const animeList = createAnimeListQuery();

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate({ to: path });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        class="flex w-full items-center gap-3 overflow-hidden rounded-none border border-border/50 bg-muted/30 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent"
      >
        <IconSearch class="h-4 w-4 shrink-0" />
        <span class="truncate group-data-[collapsible=icon]:hidden">
          Search...
        </span>
        <kbd class="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
          <IconCommand class="h-2.5 w-2.5" />K
        </kbd>
      </button>

      <CommandDialog open={open()} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search library or navigate..."
            value={inputValue()}
            onValueChange={setInputValue}
            class="focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-0"
          />
          <SearchResults
            inputValue={inputValue}
            animeList={animeList}
            onSelect={handleSelect}
          />
        </Command>
      </CommandDialog>
    </>
  );
}
