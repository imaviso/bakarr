import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiKeyLoginRequest, ChangePasswordRequest, LoginRequest } from "./contracts";
import {
  AuthUserSchema,
  ApiKeyResponseSchema,
  LoginResponseSchema,
  RenamePreviewItemSchema,
  RenameResultSchema,
} from "@bakarr/shared";
import { Schema } from "effect";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit, runApiEffect } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

const AnimeEpisodeStreamUrlSchema = Schema.Struct({ url: Schema.String });

export function authMeQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.me(),
    queryFn: ({ signal }) =>
      runApiEffect(fetchJson(AuthUserSchema, `${API_BASE}/auth/me`, undefined, signal)),
    staleTime: Infinity,
  });
}

export function useAuthMeQuery() {
  return useQuery(authMeQueryOptions());
}

export function authApiKeyQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.apiKey(),
    queryFn: ({ signal }) =>
      runApiEffect(fetchJson(ApiKeyResponseSchema, `${API_BASE}/auth/api-key`, undefined, signal)),
    staleTime: Infinity,
  });
}

export function useAuthApiKeyQuery() {
  return useQuery(authApiKeyQueryOptions());
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (data: LoginRequest) =>
      runApiEffect(
        fetchJson(LoginResponseSchema, `${API_BASE}/auth/login`, {
          method: "POST",
          body: data,
        }),
      ),
  });
}

export function useApiKeyLoginMutation() {
  return useMutation({
    mutationFn: (data: ApiKeyLoginRequest) =>
      runApiEffect(
        fetchJson(LoginResponseSchema, `${API_BASE}/auth/login/api-key`, {
          method: "POST",
          body: data,
        }),
      ),
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (data: ChangePasswordRequest) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/auth/password`, {
          method: "PUT",
          body: data,
        }),
      ),
  });
}

export function useRegenerateApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      runApiEffect(
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
      runApiEffect(
        fetchJson(
          Schema.Array(RenamePreviewItemSchema),
          `${API_BASE}/media/${id}/rename-preview`,
          undefined,
          signal,
        ),
      ),
  });
}

export function useRenamePreviewQuery(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    ...renamePreviewQueryOptions(id),
    enabled: options?.enabled ?? true,
  });
}

export function useAnimeEpisodeStreamUrlMutation() {
  return useMutation({
    mutationFn: (input: { mediaId: number; unitNumber: number }) =>
      runApiEffect(
        fetchJson(
          AnimeEpisodeStreamUrlSchema,
          `${API_BASE}/media/${input.mediaId}/stream-url?unitNumber=${input.unitNumber}`,
        ),
      ),
  });
}

export function useExecuteRenameMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      runApiEffect(
        fetchJson(RenameResultSchema, `${API_BASE}/media/${id}/rename`, {
          method: "POST",
        }),
      ),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.units(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}
