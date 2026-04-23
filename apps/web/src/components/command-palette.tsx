import {
  CalendarIcon,
  CaretRightIcon,
  CommandIcon,
  TelevisionIcon,
  DownloadIcon,
  HouseIcon,
  ListIcon,
  RssIcon,
  MagnifyingGlassIcon,
  GearIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

import { createAnimeListQuery } from "~/lib/api";
import { animeSearchSubtitle } from "~/lib/anime-metadata";
import { cn } from "~/lib/utils";

const navigationRoutes = [
  { title: "Dashboard", url: "/", icon: HouseIcon },
  { title: "Anime Library", url: "/anime", icon: TelevisionIcon },
  { title: "Add Anime", url: "/anime/add", icon: TelevisionIcon },
  { title: "RSS Feeds", url: "/rss", icon: RssIcon },
  { title: "Wanted", url: "/wanted", icon: MagnifyingGlassIcon },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Downloads", url: "/downloads", icon: DownloadIcon },
  { title: "System Logs", url: "/logs", icon: ListIcon },
  { title: "Settings", url: "/settings", icon: GearIcon },
];

function SearchResults(props: {
  inputValue: string;
  animeList: ReturnType<typeof createAnimeListQuery>;
  onSelect: (path: string) => void;
}) {
  const query = props.inputValue.toLowerCase().trim();
  const data = props.animeList.data;

  const filteredLibrary = !data
    ? []
    : !query
      ? data.slice(0, 10)
      : data
          .filter((anime) => {
            const title = anime.title.romaji?.toLowerCase() || "";
            const english = anime.title.english?.toLowerCase() || "";
            const native = anime.title.native?.toLowerCase() || "";
            return title.includes(query) || english.includes(query) || native.includes(query);
          })
          .slice(0, 10);

  const filteredRoutes = query
    ? navigationRoutes.filter((route) => route.title.toLowerCase().includes(query))
    : navigationRoutes;

  return (
    <CommandList>
      {props.animeList.isLoading && <CommandEmpty>Loading library...</CommandEmpty>}

      {!props.animeList.isLoading &&
        filteredLibrary.length === 0 &&
        filteredRoutes.length === 0 && <CommandEmpty>No results found.</CommandEmpty>}

      {/* Navigation Routes */}
      {filteredRoutes.length > 0 && (
        <CommandGroup heading="Navigation">
          {filteredRoutes.map((route) => (
            <CommandItem
              key={route.url}
              value={`nav-${route.url}`}
              onSelect={() => props.onSelect(route.url)}
            >
              <route.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{route.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {/* Library Section */}
      {!props.animeList.isLoading && filteredLibrary.length > 0 && (
        <>
          <CommandSeparator />
          <CommandGroup heading="Library">
            {filteredLibrary.map((anime) => (
              <CommandItem
                key={anime.id}
                value={`library-${anime.id}`}
                onSelect={() => props.onSelect(`/anime/${anime.id}`)}
              >
                {anime.cover_image && (
                  <img
                    src={anime.cover_image}
                    alt={anime.title.romaji}
                    loading="lazy"
                    className="mr-2 h-8 w-6 object-cover"
                  />
                )}
                <div className="flex flex-col">
                  <span className="font-medium">{anime.title.romaji}</span>
                  {anime.title.english && anime.title.english !== anime.title.romaji && (
                    <span className="text-xs text-muted-foreground">{anime.title.english}</span>
                  )}
                  {(animeSearchSubtitle(anime) || anime.genres?.length) && (
                    <span className="text-xs text-muted-foreground">
                      {[animeSearchSubtitle(anime), anime.genres?.[0]]
                        .filter((value): value is string => Boolean(value))
                        .join(" • ")}
                    </span>
                  )}
                </div>
                <CaretRightIcon className="ml-auto h-4 w-4 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      )}
    </CommandList>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const animeList = createAnimeListQuery({ enabled: open });

  const handleSelect = (path: string) => {
    setOpen(false);
    void navigate({ to: path });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 overflow-hidden rounded-none border border-border bg-muted px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
          "group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent",
        )}
      >
        <MagnifyingGlassIcon className="h-4 w-4 shrink-0" />
        <span className="truncate group-data-[collapsible=icon]:hidden">Search...</span>
        <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded-none border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
          <CommandIcon className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search library or navigate..."
            value={inputValue}
            onValueChange={setInputValue}
            className="focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-0 focus-visible:border-b focus-visible:border-primary"
          />
          <SearchResults inputValue={inputValue} animeList={animeList} onSelect={handleSelect} />
        </Command>
      </CommandDialog>
    </>
  );
}
