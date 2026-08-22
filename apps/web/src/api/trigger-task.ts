import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { AsyncOperationAcceptedSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, runApiEffect } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

/**
 * Mutation for async-task endpoints: POST returns `AsyncOperationAccepted`,
 * shows the accepted message as a toast, and invalidates the system task list
 * plus any caller-supplied keys.
 */
export function useTriggerTaskMutation<TVariables = void>(options: {
  endpoint: (variables: TVariables) => string;
  body?: (variables: TVariables) => unknown;
  invalidate?: (variables: TVariables) => readonly QueryKey[];
  /** Extra task-specific keys that need `task_id` (e.g. unit-scan byId). */
  taskKeys?: (accepted: { task_id?: number }, variables: TVariables) => readonly QueryKey[];
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: TVariables) =>
      runApiEffect(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}${options.endpoint(variables)}`, {
          method: "POST",
          body: options.body?.(variables),
        }),
      ),
    onSuccess: (accepted, variables) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.system.tasks.byId(accepted.task_id),
        });
        for (const key of options.taskKeys?.(accepted, variables) ?? []) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }
      for (const key of options.invalidate?.(variables) ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
