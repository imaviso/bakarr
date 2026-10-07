import { createFileRoute, Link } from "@tanstack/react-router";
import { RiArrowLeftLine, RiCheckLine, RiLoader4Line } from "@remixicon/react";
import { useLibraryImportTaskQuery } from "@/api/operations-tasks";
import { isTaskActive } from "@/api/operations-tasks";
import { ImportPageContent } from "@/features/import/import-page-content";
import { useImportPageState } from "@/features/import/import-page-state";
import { GeneralError } from "@/components/shared/general-error";
import { PageShell } from "@/components/shared/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { mediaListQueryOptions } from "@/api/media";
import { profilesQueryOptions } from "@/api/profiles";
import { systemConfigQueryOptions } from "@/api/system-config";
import { usePageTitle } from "@/hooks/use-page-title";
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
  const search = Route.useSearch();

  const state = useImportPageState({
    mediaId: search.mediaId,
  });
  const latestImportTask = useLibraryImportTaskQuery(state.latestImportTaskId);
  const latestTask = latestImportTask.data;
  const isImportTaskRunning = latestTask !== undefined && isTaskActive(latestTask);

  return (
    <PageShell scroll="inner">
      {latestTask && (
        <Alert className="mb-4">
          {isImportTaskRunning ? (
            <RiLoader4Line className="h-4 w-4 animate-spin" />
          ) : (
            <RiCheckLine className="h-4 w-4 text-success" />
          )}
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-xs">
              {isImportTaskRunning ? "Import task running. " : "Import finished. "}
              {latestTask.message}
              {latestTask.progress_current != null &&
                latestTask.progress_total != null &&
                latestTask.progress_total > 0 &&
                ` (${latestTask.progress_current}/${latestTask.progress_total})`}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {!isImportTaskRunning && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onPress={() => {
                    state.flow.setStep("scan");
                  }}
                >
                  Import more files
                </Button>
              )}
              <Link
                to="/media"
                search={{ q: "", filter: "all", view: "grid" }}
                className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
              >
                <RiArrowLeftLine className="h-3 w-3" />
                Back to library
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      <ImportPageContent state={state} />
    </PageShell>
  );
}
