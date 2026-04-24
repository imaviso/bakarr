import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createLibraryImportTaskQuery } from "~/lib/api";
import { Schema } from "effect";
import { ImportPageContent } from "~/components/import/import-page-content";
import { createImportPageState } from "~/components/import/import-page-state";
import { GeneralError } from "~/components/general-error";
import {
  animeListQueryOptions,
  isTaskActive,
  profilesQueryOptions,
  systemConfigQueryOptions,
} from "~/lib/api";
import { usePageTitle } from "~/lib/page-title";

const ImportSearchSchema = Schema.Struct({
  animeId: Schema.optional(Schema.Union(Schema.Number, Schema.NumberFromString).pipe(Schema.int())),
});

export const Route = createFileRoute("/_layout/anime/import")({
  validateSearch: (search) => Schema.decodeUnknownSync(ImportSearchSchema)(search),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(animeListQueryOptions()),
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
  },
  component: ImportPage,
  errorComponent: GeneralError,
});

function ImportPage() {
  usePageTitle("Import");
  const navigate = useNavigate();
  const search = Route.useSearch();

  const state = createImportPageState({
    animeId: search.animeId,
    onImportSuccess: () => {
      void navigate({
        to: "/anime",
        search: { q: "", filter: "all", view: "grid" },
      });
    },
  });
  const latestImportTask = createLibraryImportTaskQuery(state.latestImportTaskId);
  const isImportTaskRunning =
    latestImportTask.data !== undefined && isTaskActive(latestImportTask.data);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {isImportTaskRunning && (
        <p className="text-xs text-muted-foreground">Import task running. Progress updates live.</p>
      )}
      <ImportPageContent state={state} />
    </div>
  );
}
