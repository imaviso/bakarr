import {
  RiAddLine,
  RiFilterLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiLayoutGridLine,
  RiListUnordered,
  RiSearchLine,
  RiTvLine,
} from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { IconButton } from "@/components/shared/icon-button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Suspense, lazy } from "react";
import { Schema, SchemaTransformation } from "effect";
import { AnimeListSkeleton } from "@/features/media/media-list-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralError } from "@/components/shared/general-error";
import { PageHeader } from "@/app/layout/page-header";
import { PageShell } from "@/app/layout/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import { mediaListQueryOptions } from "@/api/media";
import { useDeleteMediaMutation } from "@/api/media-mutations";
import { systemConfigQueryOptions } from "@/api/system-config";
import { filterAnimeLibrary } from "@/domain/media/library-filter";
import { getAiringDisplayPreferences } from "@/domain/media/metadata";
import { usePageTitle } from "@/app/page-title";
import { cn } from "@/infra/utils";

const AnimeGridViewLazy = lazy(() =>
  import("@/features/media/media-library-views").then((module) => ({
    default: module.AnimeGridView,
  })),
);
const AnimeListViewLazy = lazy(() =>
  import("@/features/media/media-library-views").then((module) => ({
    default: module.AnimeListView,
  })),
);

const MonitorFilterSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Literals(["all", "monitored", "unmonitored"]),
    SchemaTransformation.transform({
      decode: (s) =>
        s === "monitored" ? "monitored" : s === "unmonitored" ? "unmonitored" : "all",
      encode: (s) => s,
    }),
  ),
);

const ViewModeSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Literals(["grid", "list"]),
    SchemaTransformation.transform({
      decode: (s) => (s === "list" ? "list" : "grid"),
      encode: (s) => s,
    }),
  ),
);

const DEFAULT_ANIME_SEARCH = {
  filter: "all",
  q: "",
  view: "grid",
} as const;

const SEARCH_DEBOUNCE_MS = 150;

type MonitorFilter = Schema.Schema.Type<typeof MonitorFilterSchema>;

const isMonitorFilter = Schema.is(MonitorFilterSchema);

const AnimeSearchSchema = Schema.Struct({
  q: Schema.optional(Schema.String),
  filter: Schema.optional(MonitorFilterSchema),
  view: Schema.optional(ViewModeSchema),
});

export const Route = createFileRoute("/_layout/media/")({
  validateSearch: Schema.toStandardSchemaV1(AnimeSearchSchema),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(mediaListQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
  },
  component: AnimeIndexPage,
  errorComponent: GeneralError,
});

function AnimeIndexPage() {
  usePageTitle("Library");
  const deleteMedia = useDeleteMediaMutation();
  const media = useSuspenseQuery(mediaListQueryOptions()).data;
  const systemConfig = useSuspenseQuery(systemConfigQueryOptions()).data;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const airingPreferences = getAiringDisplayPreferences(systemConfig.library);

  const query = search.q ?? DEFAULT_ANIME_SEARCH.q;
  const filter = search.filter ?? DEFAULT_ANIME_SEARCH.filter;
  const view = search.view ?? DEFAULT_ANIME_SEARCH.view;
  const [debouncedQuery] = useDebouncedValue(query, { wait: SEARCH_DEBOUNCE_MS });

  const handleSearchInput = (q: string) => {
    void navigate({
      to: ".",
      search: { q, filter, view },
      replace: true,
    });
  };

  const filteredList = filterAnimeLibrary(media, debouncedQuery, filter);

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
    <PageShell scroll="inner">
      <PageHeader
        title="Library"
        subtitle={
          filteredList.length === media.length
            ? `${media.length} titles`
            : `${filteredList.length} of ${media.length} titles`
        }
      >
        <Link
          to="/media/add"
          className={buttonVariants({ size: "sm", class: "shrink-0 gap-1.5" })}
          aria-label="Add media"
        >
          <RiAddLine className="h-4 w-4" />
          <span className="hidden sm:inline">Add Media</span>
        </Link>
      </PageHeader>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative flex-1">
          <RiSearchLine className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter media..."
            aria-label="Filter media"
            value={query}
            onInput={(event) => handleSearchInput(event.currentTarget.value)}
            className="pl-9"
          />
        </div>

        <DropdownMenuTrigger>
          <Button variant="outline" size="icon" aria-label="Filter by status">
            <RiFilterLine className="h-4 w-4" />
          </Button>
          <DropdownMenu
            selectionMode="single"
            selectedKeys={[filter]}
            onSelectionChange={(keys) => {
              for (const value of keys) {
                if (typeof value === "string" && isMonitorFilter(value)) {
                  updateFilter(value);
                }
                break;
              }
            }}
          >
            <DropdownMenuItem id="all">All Media</DropdownMenuItem>
            <DropdownMenuItem id="monitored">Monitored</DropdownMenuItem>
            <DropdownMenuItem id="unmonitored">Unmonitored</DropdownMenuItem>
          </DropdownMenu>
        </DropdownMenuTrigger>

        <Separator orientation="vertical" className="h-6" />

        <Link
          to="/media/import"
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Import from folder"
        >
          <RiFolderOpenLine className="h-4 w-4" />
        </Link>

        <Link
          to="/media/scan"
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Scan library"
        >
          <RiFolderLine className="h-4 w-4" />
        </Link>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-1 bg-muted p-1">
          <IconButton
            size="icon-sm"
            className={cn(view === "grid" ? "bg-background " : "hover:bg-background")}
            aria-label="Grid view"
            onPress={() => updateView("grid")}
          >
            <RiLayoutGridLine className="h-4 w-4" />
          </IconButton>

          <IconButton
            size="icon-sm"
            className={cn(view === "list" ? "bg-background " : "hover:bg-background")}
            aria-label="List view"
            onPress={() => updateView("list")}
          >
            <RiListUnordered className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
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
                media={filteredList}
                airingPreferences={airingPreferences}
                deleteMedia={deleteMedia}
              />
            ) : (
              <AnimeListViewLazy
                media={filteredList}
                airingPreferences={airingPreferences}
                deleteMedia={deleteMedia}
              />
            )}
          </Suspense>
        ) : !query && filter === "all" ? (
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              icon={<RiTvLine className="h-12 w-12" />}
              title="No media yet"
              description="Add your first title to start monitoring"
              className="border-dashed"
            >
              <Link to="/media/add" className={buttonVariants()}>
                <RiAddLine className="mr-2 h-4 w-4" />
                Add Media
              </Link>
            </EmptyState>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              title={query ? `No media matching "${query}"` : `No ${filter} media found`}
            />
          </div>
        )}
      </div>
    </PageShell>
  );
}
