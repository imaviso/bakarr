import { queryOptions, useQuery } from "@tanstack/react-query";
import type { OperationTask, OperationTaskKey } from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

const ACTIVE_TASK_STATUSES = new Set(["queued", "running"]);

export function isTaskActive(task: Pick<OperationTask, "status">) {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

export function operationTaskPollInterval(task: OperationTask | undefined) {
  if (task === undefined) {
    return false;
  }

  return isTaskActive(task) ? 1000 : false;
}

function buildTaskQueryParams(input?: {
  readonly animeId?: number;
  readonly taskKey?: OperationTaskKey;
}) {
  const params = new URLSearchParams();

  if (input?.animeId !== undefined) {
    params.set("anime_id", String(input.animeId));
  }

  if (input?.taskKey !== undefined) {
    params.set("task_key", input.taskKey);
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

export function systemTasksQueryOptions(input?: {
  readonly animeId?: number;
  readonly taskKey?: OperationTaskKey;
}) {
  return queryOptions({
    queryKey: [...animeKeys.system.tasks.all(), input ?? {}] as const,
    queryFn: ({ signal }) =>
      fetchApi<OperationTask[]>(
        `${API_BASE}/system/tasks${buildTaskQueryParams({
          ...(input?.animeId === undefined ? {} : { animeId: input.animeId }),
          ...(input?.taskKey === undefined ? {} : { taskKey: input.taskKey }),
        })}`,
        undefined,
        signal,
      ),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((task) => isTaskActive(task)) ? 1000 : false;
    },
  });
}

export function createSystemTasksQuery(
  input: { readonly animeId?: number; readonly taskKey?: OperationTaskKey } = {},
) {
  return useQuery(systemTasksQueryOptions(input));
}

export function systemTaskQueryOptions(taskId: number) {
  return queryOptions({
    queryKey: animeKeys.system.tasks.byId(taskId),
    queryFn: ({ signal }) =>
      fetchApi<OperationTask>(`${API_BASE}/system/tasks/${taskId}`, undefined, signal),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function createSystemTaskQuery(taskId: number | undefined) {
  return useQuery({
    ...(taskId === undefined ? systemTaskQueryOptions(0) : systemTaskQueryOptions(taskId)),
    enabled: taskId !== undefined,
  });
}

export function libraryImportTasksQueryOptions(input?: { readonly animeId?: number }) {
  return queryOptions({
    queryKey: [...animeKeys.library.importTasks.all(), input ?? {}] as const,
    queryFn: ({ signal }) =>
      fetchApi<OperationTask[]>(
        `${API_BASE}/library/import/tasks${buildTaskQueryParams(
          input?.animeId === undefined ? undefined : { animeId: input.animeId },
        )}`,
        undefined,
        signal,
      ),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((task) => isTaskActive(task)) ? 1000 : false;
    },
  });
}

export function createLibraryImportTasksQuery(input: { readonly animeId?: number } = {}) {
  return useQuery(libraryImportTasksQueryOptions(input));
}

export function libraryImportTaskQueryOptions(taskId: number) {
  return queryOptions({
    queryKey: animeKeys.library.importTasks.byId(taskId),
    queryFn: ({ signal }) =>
      fetchApi<OperationTask>(`${API_BASE}/library/import/tasks/${taskId}`, undefined, signal),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function createLibraryImportTaskQuery(taskId: number | undefined) {
  return useQuery({
    ...(taskId === undefined
      ? libraryImportTaskQueryOptions(0)
      : libraryImportTaskQueryOptions(taskId)),
    enabled: taskId !== undefined,
  });
}

export function animeScanTasksQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.episodeScanTasks.all(animeId),
    queryFn: ({ signal }) =>
      fetchApi<OperationTask[]>(
        `${API_BASE}/anime/${animeId}/episodes/scan/tasks`,
        undefined,
        signal,
      ),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((task) => isTaskActive(task)) ? 1000 : false;
    },
  });
}

export function createAnimeScanTasksQuery(animeId: number | undefined) {
  return useQuery({
    ...(animeId === undefined
      ? animeScanTasksQueryOptions(0)
      : animeScanTasksQueryOptions(animeId)),
    enabled: animeId !== undefined,
  });
}

export function animeScanTaskQueryOptions(input: {
  readonly animeId: number;
  readonly taskId: number;
}) {
  return queryOptions({
    queryKey: animeKeys.episodeScanTasks.byId(input.animeId, input.taskId),
    queryFn: ({ signal }) =>
      fetchApi<OperationTask>(
        `${API_BASE}/anime/${input.animeId}/episodes/scan/tasks/${input.taskId}`,
        undefined,
        signal,
      ),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function createAnimeScanTaskQuery(input: {
  readonly animeId?: number;
  readonly taskId?: number;
}) {
  if (input.animeId === undefined || input.taskId === undefined) {
    return useQuery({
      ...animeScanTaskQueryOptions({ animeId: 0, taskId: 0 }),
      enabled: false,
    });
  }

  return useQuery({
    ...animeScanTaskQueryOptions({ animeId: input.animeId, taskId: input.taskId }),
    enabled: true,
  });
}
