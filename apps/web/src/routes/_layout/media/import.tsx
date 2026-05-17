import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLibraryImportTaskQuery } from "~/api/operations-tasks";
import { ImportPageContent } from "~/features/import/import-page-content";
import { useImportPageState } from "~/features/import/import-page-state";
import { GeneralError } from "~/components/shared/general-error";
import { PageShell } from "~/app/layout/page-shell";
import { mediaListQueryOptions } from "~/api/media";
import { isTaskActive } from "~/api/operations-tasks";
import { profilesQueryOptions } from "~/api/profiles";
import { systemConfigQueryOptions } from "~/api/system-config";
import { usePageTitle } from "~/domain/page-title";
import { parseImportSearch } from "./-import-search";

export const Route = createFileRoute("/_layout/media/import")({
  validateSearch: (search) => parseImportSearch(search),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(mediaListQueryOptions()),
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

  const state = useImportPageState({
    mediaId: search.mediaId,
    onImportSuccess: () => {
      void navigate({
        to: "/media",
        search: { q: "", filter: "all", view: "grid" },
      });
    },
  });
  const latestImportTask = useLibraryImportTaskQuery(state.latestImportTaskId);
  const isImportTaskRunning =
    latestImportTask.data !== undefined && isTaskActive(latestImportTask.data);

  return (
    <PageShell scroll="inner">
      {isImportTaskRunning && (
        <p className="text-xs text-muted-foreground">Import task running. Progress updates live.</p>
      )}
      <ImportPageContent state={state} />
    </PageShell>
  );
}
