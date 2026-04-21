import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GeneralError } from "~/components/general-error";
import { useLogsRouteState } from "~/features/logs/logs-route-state";
import { parseLogsSearch } from "~/features/logs/logs-search";
import { LogsView } from "~/features/logs/logs-view";
import { infiniteLogsQueryOptions } from "~/lib/api";
import { usePageTitle } from "~/lib/page-title";

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
  usePageTitle(() => "System Logs");
  const search = Route.useSearch();
  const navigate = useNavigate();

  const updateSearch = (patch: Partial<Record<string, string>>) => {
    void navigate({
      to: ".",
      search: { ...search, ...patch },
      replace: true,
    });
  };

  const state = useLogsRouteState({
    search,
    updateSearch,
  });

  return <LogsView state={state} />;
}
