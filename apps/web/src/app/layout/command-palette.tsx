import {
  RiArrowRightSLine,
  RiCalendarLine,
  RiCommandLine,
  RiDownloadLine,
  RiHome5Line,
  RiListUnordered,
  RiRssLine,
  RiSearchLine,
  RiSettings3Line,
  RiTvLine,
} from "@remixicon/react";
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
} from "@/components/ui/command";

import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { useMediaListQuery } from "@/api/media";
import { animeSearchSubtitle } from "@/domain/media/metadata";
import { cn } from "@/infra/utils";

const navigationRoutes = [
  { title: "Dashboard", url: "/", icon: RiHome5Line },
  { title: "Library", url: "/media", icon: RiTvLine },
  { title: "Add Media", url: "/media/add", icon: RiTvLine },
  { title: "RSS Feeds", url: "/rss", icon: RiRssLine },
  { title: "Wanted", url: "/wanted", icon: RiSearchLine },
  { title: "Calendar", url: "/calendar", icon: RiCalendarLine },
  { title: "Downloads", url: "/downloads", icon: RiDownloadLine },
  { title: "System Logs", url: "/logs", icon: RiListUnordered },
  { title: "Settings", url: "/settings", icon: RiSettings3Line },
];

function SearchResults(props: {
  inputValue: string;
  animeList: ReturnType<typeof useMediaListQuery>;
  onSelect: (path: string) => void;
}) {
  const query = props.inputValue.toLowerCase().trim();
  const data = props.animeList.data;

  const filteredLibrary = !data
    ? []
    : !query
      ? data.slice(0, 10)
      : data
          .filter((media) => {
            const title = media.title.romaji?.toLowerCase() || "";
            const english = media.title.english?.toLowerCase() || "";
            const native = media.title.native?.toLowerCase() || "";
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
              id={`nav-${route.url}`}
              textValue={`nav-${route.url} ${route.title}`}
              onAction={() => props.onSelect(route.url)}
            >
              <route.icon className="size-4 shrink-0 text-muted-foreground" />
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
            {filteredLibrary.map((media) => (
              <CommandItem
                key={media.id}
                id={`library-${media.id}`}
                textValue={`library-${media.id} ${media.title.romaji} ${media.title.english ?? ""}`}
                onAction={() => props.onSelect(`/media/${media.id}`)}
              >
                {media.cover_image ? (
                  <img
                    src={media.cover_image}
                    alt={media.title.romaji}
                    loading="lazy"
                    className="h-8 w-6 shrink-0 bg-muted object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-6 shrink-0 items-center justify-center bg-muted">
                    <RiTvLine className="size-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{media.title.romaji}</span>
                  {media.title.english && media.title.english !== media.title.romaji && (
                    <span className="truncate text-xs text-muted-foreground">
                      {media.title.english}
                    </span>
                  )}
                  {(animeSearchSubtitle(media) || media.genres?.length) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {[animeSearchSubtitle(media), media.genres?.[0]]
                        .filter((value): value is string => Boolean(value))
                        .join(" • ")}
                    </span>
                  )}
                </div>
                <RiArrowRightSLine className="size-4 shrink-0 text-muted-foreground" />
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

  const animeList = useMediaListQuery({ enabled: open });

  const handleSelect = (path: string) => {
    setOpen(false);
    void navigate({ to: path });
  };

  return (
    <>
      <Button
        variant="ghost"
        onPress={() => setOpen(true)}
        aria-label="Search library or navigate"
        className={cn(
          "h-9 w-full justify-start gap-2 overflow-hidden rounded-none border border-border bg-muted px-2 py-1.5 text-left text-xs font-normal text-muted-foreground hover:bg-accent hover:text-foreground",
          "group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent",
        )}
      >
        <RiSearchLine className="h-4 w-4 shrink-0" />
        <span className="truncate group-data-[collapsible=icon]:hidden">Search...</span>
        <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
          <RiCommandLine className="h-2.5 w-2.5" />K
        </Kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command filter={() => true}>
          <CommandInput
            placeholder="Search library or navigate..."
            value={inputValue}
            onChange={(event) => setInputValue(event.currentTarget.value)}
          />
          <SearchResults inputValue={inputValue} animeList={animeList} onSelect={handleSelect} />
        </Command>
      </CommandDialog>
    </>
  );
}
