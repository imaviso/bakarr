import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import { isOperationTaskStatusActive, OperationTaskSchema } from "@bakarr/shared";
import type { OperationTask } from "./contracts";
import { API_BASE } from "@/api/constants";
import { fetchJson, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";

export function isTaskActive(task: Pick<OperationTask, "status">) {
  return isOperationTaskStatusActive(task.status);
}

export function operationTaskPollInterval(task: OperationTask | undefined) {
  if (task === undefined) {
    return false;
  }

  return isTaskActive(task) ? 1000 : false;
}

export function systemTaskQueryOptions(taskId: number | undefined) {
  return queryOptions({
    queryKey:
      taskId === undefined ? animeKeys.system.tasks.pending : animeKeys.system.tasks.byId(taskId),
    queryFn:
      taskId === undefined
        ? skipToken
        : ({ signal }) =>
            runApiEffect(
              fetchJson(
                OperationTaskSchema,
                `${API_BASE}/system/tasks/${taskId}`,
                undefined,
                signal,
              ),
            ),
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function useSystemTaskQuery(taskId: number | undefined) {
  return useQuery(systemTaskQueryOptions(taskId));
}

export function libraryImportTaskQueryOptions(taskId: number | undefined) {
  return queryOptions({
    queryKey:
      taskId === undefined
        ? animeKeys.library.importTasks.pending
        : animeKeys.library.importTasks.byId(taskId),
    queryFn:
      taskId === undefined
        ? skipToken
        : ({ signal }) =>
            runApiEffect(
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
  return useQuery(libraryImportTaskQueryOptions(taskId));
}

export function animeScanTaskQueryOptions(input: {
  readonly mediaId?: number;
  readonly taskId?: number;
}) {
  const ready = input.mediaId !== undefined && input.taskId !== undefined;
  const mediaId = input.mediaId ?? 0;
  const taskId = input.taskId ?? 0;

  return queryOptions({
    queryKey: ready
      ? animeKeys.unitScanTasks.byId(mediaId, taskId)
      : animeKeys.unitScanTasks.pending,
    queryFn: ready
      ? ({ signal }) =>
          runApiEffect(
            fetchJson(
              OperationTaskSchema,
              `${API_BASE}/media/${mediaId}/units/scan/tasks/${taskId}`,
              undefined,
              signal,
            ),
          )
      : skipToken,
    refetchInterval: (query) => operationTaskPollInterval(query.state.data),
  });
}

export function useAnimeScanTaskQuery(input: {
  readonly mediaId?: number;
  readonly taskId?: number;
}) {
  return useQuery(animeScanTaskQueryOptions(input));
}