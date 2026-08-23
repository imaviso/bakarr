import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { BackgroundJobStatus, Config } from "./contracts";
import { Schema } from "effect";
import {
  BackgroundJobStatusSchema,
  ConfigSchema,
  ObservabilityStatusSchema,
  OpsDashboardSchema,
  SystemStatusSchema,
} from "@bakarr/shared";
import { API_BASE } from "@/api/constants";
import { fetchJson, fetchUnit, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";
import { useTriggerTaskMutation } from "./trigger-task";

export function systemConfigQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.config(),
    queryFn: ({ signal }) =>
      runApiEffect(fetchJson(ConfigSchema, `${API_BASE}/system/config`, undefined, signal)),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function useSystemConfigQuery(enabled: boolean = true) {
  return useQuery({
    ...systemConfigQueryOptions(),
    enabled,
  });
}

export function useUpdateSystemConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Config) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/system/config`, {
          method: "PUT",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.config() });
    },
  });
}

export function systemStatusQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.status(),
    queryFn: ({ signal }) =>
      runApiEffect(fetchJson(SystemStatusSchema, `${API_BASE}/system/status`, undefined, signal)),
    refetchInterval: 30000,
  });
}

export function useSystemStatusQuery() {
  return useQuery(systemStatusQueryOptions());
}

export function useTriggerScanMutation() {
  return useTriggerTaskMutation({ endpoint: () => "/system/tasks/scan" });
}

export function useTriggerRssCheckMutation() {
  return useTriggerTaskMutation({ endpoint: () => "/system/tasks/rss" });
}

export function useTriggerMetadataRefreshMutation() {
  return useTriggerTaskMutation({ endpoint: () => "/system/tasks/metadata-refresh" });
}

function jobsRefetchInterval(query: {
  readonly state: { readonly data: readonly BackgroundJobStatus[] | undefined };
}): number | false {
  const unmappedScan = query.state.data?.find((job) => job.name === "unmapped_scan");
  return unmappedScan?.is_running ? 1000 : false;
}

function composePollIntervals(a: number | false | undefined, b: number | false): number | false {
  if (a === false || b === false) return false;
  if (a === undefined) return b;
  return Math.min(a, b);
}

export function systemJobsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.jobs(),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.mutable(Schema.Array(BackgroundJobStatusSchema)),
          `${API_BASE}/system/jobs`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 10,
    refetchInterval: jobsRefetchInterval,
  });
}

export function useSystemJobsQuery(options?: { refetchInterval?: number | false }) {
  const query = systemJobsQueryOptions();

  return useQuery({
    ...query,
    refetchInterval:
      options?.refetchInterval === undefined
        ? jobsRefetchInterval
        : (q) => composePollIntervals(options?.refetchInterval, jobsRefetchInterval(q)),
  });
}

export function systemDashboardQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.dashboard(),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(OpsDashboardSchema, `${API_BASE}/system/dashboard`, undefined, signal),
      ),
    staleTime: 1000 * 10,
  });
}

export function useSystemDashboardQuery(options?: { refetchInterval?: number | false }) {
  const query = systemDashboardQueryOptions();

  return useQuery({
    ...query,
    ...(options?.refetchInterval === undefined ? {} : { refetchInterval: options.refetchInterval }),
  });
}

export function observabilityStatusQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.observability(),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(ObservabilityStatusSchema, `${API_BASE}/system/observability`, undefined, signal),
      ),
    staleTime: 1000 * 30,
  });
}

export function useObservabilityStatusQuery() {
  return useQuery(observabilityStatusQueryOptions());
}
