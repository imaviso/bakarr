import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { GeneralError } from "~/components/general-error";
import { downloadHistoryQueryOptions } from "~/lib/api";
import { parseDownloadsSearch, useDownloadsRouteState } from "./downloads-route-state";
import { DownloadsView } from "./downloads-view";

export const Route = createFileRoute("/_layout/downloads")({
  validateSearch: parseDownloadsSearch,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(downloadHistoryQueryOptions());
  },
  component: DownloadsPage,
  errorComponent: GeneralError,
});

function DownloadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const updateSearch = (patch: Partial<Record<string, string>>) => {
    void navigate({
      to: ".",
      search: { ...search(), ...patch },
      replace: true,
    });
  };

  const state = useDownloadsRouteState({
    search,
    updateSearch,
  });

  return <DownloadsView searchTab={search().tab} state={state} />;
}
