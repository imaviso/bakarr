import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GeneralError } from "~/components/general-error";
import {
  normalizeDownloadsSearch,
  parseDownloadsSearch,
  type DownloadsSearchPatch,
} from "~/features/downloads/downloads-search";
import { useDownloadsRouteState } from "~/features/downloads/downloads-route-state";
import { DownloadsView } from "~/features/downloads/downloads-view";
import { downloadHistoryQueryOptions } from "~/lib/api";
import { usePageTitle } from "~/lib/page-title";

export const Route = createFileRoute("/_layout/downloads")({
  validateSearch: parseDownloadsSearch,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(downloadHistoryQueryOptions());
  },
  component: DownloadsPage,
  errorComponent: GeneralError,
});

function DownloadsPage() {
  usePageTitle("Downloads");
  const search = Route.useSearch();
  const navigate = useNavigate();

  const updateSearch = (patch: DownloadsSearchPatch) => {
    void navigate({
      to: ".",
      search: (previous) =>
        normalizeDownloadsSearch(
          parseDownloadsSearch({ ...(previous as Record<string, unknown>), ...patch }),
        ),
      replace: true,
    });
  };

  const state = useDownloadsRouteState({
    search,
    updateSearch,
  });

  return <DownloadsView searchTab={search.tab ?? "queue"} state={state} />;
}
