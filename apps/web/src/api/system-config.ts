import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Config } from "./contracts";
import { Effect, Schema } from "effect";
import {
  AsyncOperationAcceptedSchema,
  BackgroundJobStatusSchema,
  ConfigSchema,
  ObservabilityStatusSchema,
  OpsDashboardSchema,
  SystemStatusSchema,
} from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function systemConfigQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.config(),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(ConfigSchema, `${API_BASE}/system/config`, undefined, signal)),
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
      Effect.runPromise(
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
      Effect.runPromise(
        fetchJson(SystemStatusSchema, `${API_BASE}/system/status`, undefined, signal),
      ),
    refetchInterval: 30000,
  });
}

export function useSystemStatusQuery() {
  return useQuery(systemStatusQueryOptions());
}

export function useTriggerScanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/system/tasks/scan`, {
          method: "POST",
        }),
      ),
    onSuccess: (accepted) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.system.tasks.byId(accepted.task_id),
        });
      }
    },
  });
}

export function useTriggerRssCheckMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/system/tasks/rss`, { method: "POST" }),
      ),
    onSuccess: (accepted) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.system.tasks.byId(accepted.task_id),
        });
      }
    },
  });
}

export function useTriggerMetadataRefreshMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/system/tasks/metadata-refresh`, {
          method: "POST",
        }),
      ),
    onSuccess: (accepted) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.system.tasks.byId(accepted.task_id),
        });
      }
    },
  });
}

export function systemJobsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.jobs(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.mutable(Schema.Array(BackgroundJobStatusSchema)),
          `${API_BASE}/system/jobs`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 10,
    refetchInterval: (query) => {
      const unmappedScan = query.state.data?.find((job) => job.name === "unmapped_scan");

      return unmappedScan?.is_running ? 1000 : false;
    },
  });
}

export function useSystemJobsQuery(options?: { refetchInterval?: number | false }) {
  const query = systemJobsQueryOptions();

  return useQuery({
    ...query,
    ...(options?.refetchInterval === undefined ? {} : { refetchInterval: options.refetchInterval }),
  });
}

export function systemDashboardQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.dashboard(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
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
      Effect.runPromise(
        fetchJson(ObservabilityStatusSchema, `${API_BASE}/system/observability`, undefined, signal),
      ),
    staleTime: 1000 * 30,
  });
}

export function useObservabilityStatusQuery() {
  return useQuery(observabilityStatusQueryOptions());
}
