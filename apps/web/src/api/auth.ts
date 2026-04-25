import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiKeyLoginRequest, ChangePasswordRequest, LoginRequest } from "./contracts";
import {
  AuthUserSchema,
  ApiKeyResponseSchema,
  LoginResponseSchema,
  RenamePreviewItemSchema,
  RenameResultSchema,
} from "@bakarr/shared";
import { Effect, Schema } from "effect";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

const AnimeEpisodeStreamUrlSchema = Schema.Struct({ url: Schema.String });

export function authMeQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.me(),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(AuthUserSchema, `${API_BASE}/auth/me`, undefined, signal)),
    staleTime: Infinity,
  });
}

export function createAuthMeQuery() {
  return useQuery(authMeQueryOptions());
}

export function authApiKeyQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.apiKey(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(ApiKeyResponseSchema, `${API_BASE}/auth/api-key`, undefined, signal),
      ),
    staleTime: Infinity,
  });
}

export function createAuthApiKeyQuery() {
  return useQuery(authApiKeyQueryOptions());
}

export function createLoginMutation() {
  return useMutation({
    mutationFn: (data: LoginRequest) =>
      Effect.runPromise(
        fetchJson(LoginResponseSchema, `${API_BASE}/auth/login`, {
          method: "POST",
          body: data,
        }),
      ),
  });
}

export function createApiKeyLoginMutation() {
  return useMutation({
    mutationFn: (data: ApiKeyLoginRequest) =>
      Effect.runPromise(
        fetchJson(LoginResponseSchema, `${API_BASE}/auth/login/api-key`, {
          method: "POST",
          body: data,
        }),
      ),
  });
}

export function createChangePasswordMutation() {
  return useMutation({
    mutationFn: (data: ChangePasswordRequest) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/auth/password`, {
          method: "PUT",
          body: data,
        }),
      ),
  });
}

export function createRegenerateApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      Effect.runPromise(
        fetchJson(ApiKeyResponseSchema, `${API_BASE}/auth/api-key/regenerate`, {
          method: "POST",
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.auth.apiKey() });
    },
  });
}

export function renamePreviewQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.renamePreview(id),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(RenamePreviewItemSchema),
          `${API_BASE}/anime/${id}/rename-preview`,
          undefined,
          signal,
        ),
      ),
  });
}

export function createRenamePreviewQuery(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    ...renamePreviewQueryOptions(id),
    enabled: options?.enabled ?? true,
  });
}

export function getAnimeEpisodeStreamUrl(animeId: number, episodeNumber: number) {
  return Effect.runPromise(
    fetchJson(
      AnimeEpisodeStreamUrlSchema,
      `${API_BASE}/anime/${animeId}/stream-url?episodeNumber=${episodeNumber}`,
    ),
  );
}

export function createExecuteRenameMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      Effect.runPromise(
        fetchJson(RenameResultSchema, `${API_BASE}/anime/${id}/rename`, {
          method: "POST",
        }),
      ),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodes(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}
