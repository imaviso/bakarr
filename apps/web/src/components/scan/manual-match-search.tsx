import {
  IconAlertTriangle,
  IconLoader2,
  IconSearch,
} from "@tabler/icons-solidjs";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { type AnimeSearchResult, createAnimeSearchQuery } from "~/lib/api";
import { createDebouncer } from "~/lib/debounce";

export function ManualMatchSearch(props: {
  onSelect: (anime: AnimeSearchResult) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const debouncer = createDebouncer(setDebouncedQuery, 500);

  createEffect(() => {
    debouncer.schedule(query());
    onCleanup(() => debouncer.cancel());
  });

  const search = createAnimeSearchQuery(() => debouncedQuery());

  return (
    <div class="space-y-4">
      <div class="relative">
        <IconSearch class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <TextField value={query()} onChange={setQuery}>
          <TextFieldInput
            placeholder="Search anime title..."
            aria-label="Search anime title"
            class="pl-9"
            autofocus
          />
        </TextField>
        <Show when={search.isFetching}>
          <IconLoader2 class="absolute right-3 top-3 h-3 w-3 animate-spin text-muted-foreground" />
        </Show>
      </div>

      <div class="h-[320px] overflow-y-auto border border-border/70 bg-background">
        <Show
          when={debouncedQuery()}
          fallback={
            <div class="flex h-full flex-col items-center justify-center text-muted-foreground">
              <IconSearch class="mb-2 h-8 w-8 opacity-20" />
              <p class="text-sm">Type at least 3 characters to search</p>
            </div>
          }
        >
          <Show
            when={search.data?.length !== 0}
            fallback={
              <div class="flex h-full flex-col items-center justify-center text-muted-foreground">
                <IconAlertTriangle class="mb-2 h-8 w-8 opacity-20" />
                <p class="text-sm">No results found</p>
              </div>
            }
          >
            <div
              role="listbox"
              aria-label="Search results"
              class="divide-y divide-border/70"
            >
              <For each={search.data}>
                {(anime) => (
                  <button
                    type="button"
                    role="option"
                    onClick={() => props.onSelect(anime)}
                    class="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div class="h-12 w-9 shrink-0 overflow-hidden border border-border/60 bg-muted">
                      <Show when={anime.cover_image}>
                        <img
                          src={anime.cover_image}
                          alt={anime.title.romaji}
                          class="h-full w-full object-cover"
                        />
                      </Show>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-foreground">
                        {anime.title.romaji}
                      </p>
                      <p class="truncate text-xs text-muted-foreground">
                        {anime.title.english}
                      </p>
                    </div>
                    <Show when={anime.already_in_library}>
                      <Badge variant="secondary">In library</Badge>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
