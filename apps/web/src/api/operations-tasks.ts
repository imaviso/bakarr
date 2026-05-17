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
  readonly mediaId?: number;
  readonly taskKey?: OperationTaskKey;
}) {
  const params = new URLSearchParams();

  if (input?.mediaId !== undefined) {
    params.set("media_id", String(input.mediaId));
  }

  if (input?.taskKey !== undefined) {
    params.set("task_key", input.taskKey);
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

export function systemTasksQueryOptions(input?: {
  readonly mediaId?: number;
  readonly taskKey?: OperationTaskKey;
}) {
  return queryOptions({
    queryKey: [...animeKeys.system.tasks.all(), input ?? {}] as const,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(OperationTaskSchema),
          `${API_BASE}/system/tasks${buildTaskQueryParams({
            ...(input?.mediaId === undefined ? {} : { mediaId: input.mediaId }),
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

export function useSystemTasksQuery(
  input: { readonly mediaId?: number; readonly taskKey?: OperationTaskKey } = {},
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

export function useSystemTaskQuery(taskId: number | undefined) {
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

export function libraryImportTasksQueryOptions(input?: { readonly mediaId?: number }) {
  return queryOptions({
    queryKey: [...animeKeys.library.importTasks.all(), input ?? {}] as const,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(OperationTaskSchema),
          `${API_BASE}/library/import/tasks${buildTaskQueryParams(
            input?.mediaId === undefined ? undefined : { mediaId: input.mediaId },
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

export function useLibraryImportTasksQuery(input: { readonly mediaId?: number } = {}) {
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

export function useLibraryImportTaskQuery(taskId: number | undefined) {
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

export function animeScanTasksQueryOptions(mediaId: number) {
  return queryOptions({
    queryKey: animeKeys.unitScanTasks.all(mediaId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(OperationTaskSchema),
          `${API_BASE}/media/${mediaId}/units/scan/tasks`,
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

export function useAnimeScanTasksQuery(mediaId: number | undefined) {
  return useQuery({
    queryKey:
      mediaId === undefined
        ? (["media", "detail", "scan-tasks", "pending"] as const)
        : animeKeys.unitScanTasks.all(mediaId),
    queryFn:
      mediaId === undefined
        ? skipToken
        : ({ signal }) =>
            Effect.runPromise(
              fetchJson(
                Schema.Array(OperationTaskSchema),
                `${API_BASE}/media/${mediaId}/units/scan/tasks`,
                undefined,
                signal,
              ),
            ),
    enabled: mediaId !== undefined,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((task) => isTaskActive(task)) ? 1000 : false;
    },
  });
}

export function animeScanTaskQueryOptions(input: {
  readonly mediaId: number;
  readonly taskId: number;
}) {
  return queryOptions({
    queryKey: animeKeys.unitScanTasks.byId(input.mediaId, input.taskId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          OperationTaskSchema,
          `${API_BASE}/media/${input.mediaId}/units/scan/tasks/${input.taskId}`,
          undefined,
          signal,
        ),
      ),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function useAnimeScanTaskQuery(input: {
  readonly mediaId?: number;
  readonly taskId?: number;
}) {
  return useQuery({
    queryKey:
      input.mediaId === undefined || input.taskId === undefined
        ? (["media", "detail", "scan-tasks", "pending"] as const)
        : animeKeys.unitScanTasks.byId(input.mediaId, input.taskId),
    queryFn:
      input.mediaId === undefined || input.taskId === undefined
        ? skipToken
        : ({ signal }) =>
            Effect.runPromise(
              fetchJson(
                OperationTaskSchema,
                `${API_BASE}/media/${input.mediaId}/units/scan/tasks/${input.taskId}`,
                undefined,
                signal,
              ),
            ),
    enabled: input.mediaId !== undefined && input.taskId !== undefined,
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}
