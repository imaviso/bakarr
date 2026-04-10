import { IconDots, IconSearch } from "@tabler/icons-solidjs";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { SearchModal } from "~/components/search-modal";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  createSearchMissingMutation,
  createSystemConfigQuery,
  createWantedQuery,
  type MissingEpisode,
} from "~/lib/api";
import {
  formatAiringDateWithPreferences,
  formatNextAiringEpisode,
  getAiringDisplayPreferences,
} from "~/lib/anime-metadata";

const WantedSearchSchema = v.object({
  q: v.optional(v.string(), ""),
});

export const Route = createFileRoute("/_layout/wanted")({
  validateSearch: (search) => v.parse(WantedSearchSchema, search),
  component: WantedPage,
  errorComponent: GeneralError,
});

function WantedPage() {
  let scrollRef: HTMLDivElement | undefined;
  const limit = 100;
  const wantedQuery = createWantedQuery(() => limit);
  const configQuery = createSystemConfigQuery();
  const searchMissing = createSearchMissingMutation();
  const data = createMemo(() => wantedQuery.data ?? []);
  const airingPreferences = createMemo(() =>
    getAiringDisplayPreferences(configQuery.data?.library),
  );

  const rowVirtualizer = createVirtualizer({
    get count() {
      return data().length;
    },
    estimateSize: () => 56,
    overscan: 10,
    getScrollElement: () => scrollRef ?? null,
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

  const [searchModalState, setSearchModalState] = createSignal<{
    open: boolean;
    animeId: number;
    episodeNumber: number;
    episodeTitle?: string;
  }>({
    open: false,
    animeId: 0,
    episodeNumber: 1,
  });

  const handleSearchAll = () => {
    toast.promise(searchMissing.mutateAsync(undefined), {
      loading: "Triggering global search...",
      success: "Global search triggered in background",
      error: (err) => `Failed to trigger search: ${err.message}`,
    });
  };

  return (
    <div class="flex flex-col flex-1 min-h-0 gap-6">
      <PageHeader title="Wanted" subtitle={`${data().length} missing episodes`}>
        <Button
          variant="default"
          size="sm"
          onClick={handleSearchAll}
          disabled={searchMissing.isPending || wantedQuery.data?.length === 0}
        >
          <IconSearch class="mr-2 h-4 w-4" />
          Search All
        </Button>
      </PageHeader>

      <Card class="overflow-hidden flex-1 min-h-0 flex flex-col">
        <div
          ref={(el) => {
            scrollRef = el;
          }}
          class="overflow-y-auto flex-1"
        >
          <Table>
            <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
              <TableRow class="hover:bg-transparent border-none">
                <TableHead class="w-[60px]" />
                <TableHead>Anime</TableHead>
                <TableHead class="w-[100px]">Episode</TableHead>
                <TableHead class="hidden md:table-cell">Title</TableHead>
                <TableHead class="w-[150px]">Air Date</TableHead>
                <TableHead class="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <Show
                when={!wantedQuery.isLoading && data().length > 0}
                fallback={
                  <TableRow>
                    <TableCell colSpan={6} class="h-24 text-center">
                      {wantedQuery.isLoading ? "Loading..." : "No missing episodes found."}
                    </TableCell>
                  </TableRow>
                }
              >
                <Show when={paddingTop() > 0}>
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
                </Show>
                <For each={rowVirtualizer.getVirtualItems()}>
                  {(vRow) => {
                    const item = () => data()[vRow.index];
                    return (
                      <Show when={item()}>
                        {(safeItem) => (
                          <WantedRow
                            item={safeItem()}
                            airingPreferences={airingPreferences()}
                            onSearch={() => {
                              const episodeTitle = safeItem().episode_title;
                              setSearchModalState(
                                episodeTitle === undefined
                                  ? {
                                      open: true,
                                      animeId: safeItem().anime_id,
                                      episodeNumber: safeItem().episode_number,
                                    }
                                  : {
                                      open: true,
                                      animeId: safeItem().anime_id,
                                      episodeNumber: safeItem().episode_number,
                                      episodeTitle,
                                    },
                              );
                            }}
                          />
                        )}
                      </Show>
                    );
                  }}
                </For>
                <Show when={paddingBottom() > 0}>
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
                </Show>
              </Show>
            </TableBody>
          </Table>
        </div>
      </Card>

      <SearchModal
        animeId={searchModalState().animeId}
        episodeNumber={searchModalState().episodeNumber}
        {...(searchModalState().episodeTitle === undefined
          ? {}
          : { episodeTitle: searchModalState().episodeTitle })}
        open={searchModalState().open}
        onOpenChange={(open) => setSearchModalState((prev) => ({ ...prev, open }))}
      />
    </div>
  );
}

function WantedRow(props: {
  item: MissingEpisode;
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  onSearch: () => void;
}) {
  const statusLabel = () =>
    props.item.airing_status === "future"
      ? "Upcoming"
      : props.item.airing_status === "aired"
        ? "Missing"
        : undefined;

  return (
    <TableRow>
      <TableCell>
        <div class="h-10 w-7 rounded overflow-hidden bg-muted">
          <Show when={props.item.anime_image}>
            <img
              src={props.item.anime_image}
              alt={props.item.anime_title}
              loading="lazy"
              class="h-full w-full object-cover"
            />
          </Show>
        </div>
      </TableCell>
      <TableCell class="font-medium">
        <Link
          to="/anime/$id"
          params={{ id: props.item.anime_id.toString() }}
          class="hover:underline"
        >
          {props.item.anime_title}
        </Link>
        <Show when={props.item.next_airing_episode}>
          <div class="mt-1 text-[11px] text-muted-foreground">
            {formatNextAiringEpisode(props.item.next_airing_episode, props.airingPreferences) ||
              "Next airing scheduled"}
          </div>
        </Show>
      </TableCell>
      <TableCell>
        <div class="flex flex-col items-start gap-1">
          <Badge variant="outline" class="font-mono font-normal">
            {props.item.episode_number.toString().padStart(2, "0")}
          </Badge>
          <Show when={statusLabel()}>
            {(label) => (
              <Badge
                variant="secondary"
                class={
                  props.item.airing_status === "aired"
                    ? "h-5 px-1.5 text-xs bg-warning/10 text-warning"
                    : "h-5 px-1.5 text-xs bg-info/10 text-info"
                }
              >
                {label()}
              </Badge>
            )}
          </Show>
        </div>
      </TableCell>
      <TableCell class="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
        {props.item.episode_title || "-"}
      </TableCell>
      <TableCell class="text-sm">
        {formatAiringDateWithPreferences(props.item.aired, props.airingPreferences) || "-"}
      </TableCell>
      <TableCell>
        <DropdownMenu placement="bottom-end">
          <DropdownMenuTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="relative after:absolute after:-inset-2 h-8 w-8"
            aria-label="Episode options"
          >
            <IconDots class="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={props.onSearch}>
              <IconSearch class="mr-2 h-4 w-4" />
              Search
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
