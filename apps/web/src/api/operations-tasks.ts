import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import type { OperationTask, OperationTaskKey } from "./contracts";
import { OperationTaskSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson } from "~/api/effect/api-client";
import { Effect, Schema } from "effect";
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
      Effect.runPromise(
        fetchJson(
          Schema.Array(OperationTaskSchema),
          `${API_BASE}/system/tasks${buildTaskQueryParams({
            ...(input?.animeId === undefined ? {} : { animeId: input.animeId }),
            ...(input?.taskKey === undefined ? {} : { taskKey: input.taskKey }),
          })}`,
          undefined,
          signal,
        ),
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
      Effect.runPromise(
        fetchJson(OperationTaskSchema, `${API_BASE}/system/tasks/${taskId}`, undefined, signal),
      ),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function createSystemTaskQuery(taskId: number | undefined) {
  return useQuery({
    queryKey:
      taskId === undefined
        ? [...animeKeys.system.tasks.all(), "pending"]
        : animeKeys.system.tasks.byId(taskId),
    queryFn:
      taskId === undefined
        ? skipToken
        : ({ signal }) =>
            Effect.runPromise(
              fetchJson(
                OperationTaskSchema,
                `${API_BASE}/system/tasks/${taskId}`,
                undefined,
                signal,
              ),
            ),
    enabled: taskId !== undefined,
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function libraryImportTasksQueryOptions(input?: { readonly animeId?: number }) {
  return queryOptions({
    queryKey: [...animeKeys.library.importTasks.all(), input ?? {}] as const,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(OperationTaskSchema),
          `${API_BASE}/library/import/tasks${buildTaskQueryParams(
            input?.animeId === undefined ? undefined : { animeId: input.animeId },
          )}`,
          undefined,
          signal,
        ),
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
      Effect.runPromise(
        fetchJson(
          OperationTaskSchema,
          `${API_BASE}/library/import/tasks/${taskId}`,
          undefined,
          signal,
        ),
      ),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function createLibraryImportTaskQuery(taskId: number | undefined) {
  return useQuery({
    queryKey:
      taskId === undefined
        ? [...animeKeys.library.importTasks.all(), "pending"]
        : animeKeys.library.importTasks.byId(taskId),
    queryFn:
      taskId === undefined
        ? skipToken
        : ({ signal }) =>
            Effect.runPromise(
              fetchJson(
                OperationTaskSchema,
                `${API_BASE}/library/import/tasks/${taskId}`,
                undefined,
                signal,
              ),
            ),
    enabled: taskId !== undefined,
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function animeScanTasksQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.episodeScanTasks.all(animeId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(OperationTaskSchema),
          `${API_BASE}/anime/${animeId}/episodes/scan/tasks`,
          undefined,
          signal,
        ),
      ),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((task) => isTaskActive(task)) ? 1000 : false;
    },
  });
}

export function createAnimeScanTasksQuery(animeId: number | undefined) {
  return useQuery({
    queryKey:
      animeId === undefined
        ? (["anime", "detail", "scan-tasks", "pending"] as const)
        : animeKeys.episodeScanTasks.all(animeId),
    queryFn:
      animeId === undefined
        ? skipToken
        : ({ signal }) =>
            Effect.runPromise(
              fetchJson(
                Schema.Array(OperationTaskSchema),
                `${API_BASE}/anime/${animeId}/episodes/scan/tasks`,
                undefined,
                signal,
              ),
            ),
    enabled: animeId !== undefined,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((task) => isTaskActive(task)) ? 1000 : false;
    },
  });
}

export function animeScanTaskQueryOptions(input: {
  readonly animeId: number;
  readonly taskId: number;
}) {
  return queryOptions({
    queryKey: animeKeys.episodeScanTasks.byId(input.animeId, input.taskId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          OperationTaskSchema,
          `${API_BASE}/anime/${input.animeId}/episodes/scan/tasks/${input.taskId}`,
          undefined,
          signal,
        ),
      ),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function createAnimeScanTaskQuery(input: {
  readonly animeId?: number;
  readonly taskId?: number;
}) {
  return useQuery({
    queryKey:
      input.animeId === undefined || input.taskId === undefined
        ? (["anime", "detail", "scan-tasks", "pending"] as const)
        : animeKeys.episodeScanTasks.byId(input.animeId, input.taskId),
    queryFn:
      input.animeId === undefined || input.taskId === undefined
        ? skipToken
        : ({ signal }) =>
            Effect.runPromise(
              fetchJson(
                OperationTaskSchema,
                `${API_BASE}/anime/${input.animeId}/episodes/scan/tasks/${input.taskId}`,
                undefined,
                signal,
              ),
            ),
    enabled: input.animeId !== undefined && input.taskId !== undefined,
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}
