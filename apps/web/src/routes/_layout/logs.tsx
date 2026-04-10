import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { GeneralError } from "~/components/general-error";
import { infiniteLogsQueryOptions } from "~/lib/api";
import { useLogsRouteState } from "~/routes/_layout/logs-route-state";
import { parseLogsSearch } from "~/routes/_layout/logs-search";
import { LogsView } from "~/routes/_layout/logs-view";

export const Route = createFileRoute("/_layout/logs")({
  validateSearch: parseLogsSearch,
  loader: ({ context: { queryClient }, location }) => {
    const search = parseLogsSearch(location.search as Record<string, unknown>);

    const level = search["level"] || undefined;
    const eventType = search["eventType"] || undefined;
    const startDate = search["startDate"] || undefined;
    const endDate = search["endDate"] || undefined;

    return queryClient.ensureInfiniteQueryData(
      infiniteLogsQueryOptions(level, eventType, startDate, endDate),
    );
  },
  component: LogsPage,
  errorComponent: GeneralError,
});

function LogsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const updateSearch = (patch: Partial<Record<string, string>>) => {
    void navigate({
      to: ".",
      search: { ...search(), ...patch },
      replace: true,
    });
  };

  const state = useLogsRouteState({
    search,
    updateSearch,
  });

  return <LogsView state={state} />;
}
