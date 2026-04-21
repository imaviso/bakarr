import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AsyncOperationAccepted,
  BackgroundJobStatus,
  Config,
  OpsDashboard,
  SystemStatus,
} from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function systemConfigQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.config(),
    queryFn: ({ signal }) => fetchApi<Config>(`${API_BASE}/system/config`, undefined, signal),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function createSystemConfigQuery(enabled: boolean = true) {
  return useQuery({
    ...systemConfigQueryOptions(),
    enabled,
  });
}

export function createUpdateSystemConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Config) =>
      fetchApi(`${API_BASE}/system/config`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.config() });
    },
  });
}

export function systemStatusQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.status(),
    queryFn: ({ signal }) => fetchApi<SystemStatus>(`${API_BASE}/system/status`, undefined, signal),
    refetchInterval: 30000,
  });
}

export function createSystemStatusQuery() {
  return useQuery(systemStatusQueryOptions());
}

export function createTriggerScanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<AsyncOperationAccepted>(`${API_BASE}/system/tasks/scan`, { method: "POST" }),
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

export function createTriggerRssCheckMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<AsyncOperationAccepted>(`${API_BASE}/system/tasks/rss`, { method: "POST" }),
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

export function createTriggerMetadataRefreshMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<AsyncOperationAccepted>(`${API_BASE}/system/tasks/metadata-refresh`, {
        method: "POST",
      }),
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
      fetchApi<BackgroundJobStatus[]>(`${API_BASE}/system/jobs`, undefined, signal),
    staleTime: 1000 * 10,
    refetchInterval: (query) => {
      const unmappedScan = query.state.data?.find((job) => job.name === "unmapped_scan");

      return unmappedScan?.is_running ? 1000 : false;
    },
  });
}

export function createSystemJobsQuery() {
  return useQuery(systemJobsQueryOptions());
}

export function systemDashboardQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.dashboard(),
    queryFn: ({ signal }) =>
      fetchApi<OpsDashboard>(`${API_BASE}/system/dashboard`, undefined, signal),
    staleTime: 1000 * 10,
  });
}

export function createSystemDashboardQuery() {
  return useQuery(systemDashboardQueryOptions());
}
