import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AnimeEpisodeStreamUrl,
  ApiKeyLoginRequest,
  ApiKeyResponse,
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  RenamePreviewItem,
  RenameResult,
} from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function authMeQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.me(),
    queryFn: ({ signal }) => fetchApi<AuthUser>(`${API_BASE}/auth/me`, undefined, signal),
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
      fetchApi<ApiKeyResponse>(`${API_BASE}/auth/api-key`, undefined, signal),
    staleTime: Infinity,
  });
}

export function createAuthApiKeyQuery() {
  return useQuery(authApiKeyQueryOptions());
}

export function createLoginMutation() {
  return useMutation({
    mutationFn: (data: LoginRequest) =>
      fetchApi<LoginResponse>(`${API_BASE}/auth/login`, {
        method: "POST",
        body: JSON.stringify(data),
        skipAutoLogoutOnUnauthorized: true,
      }),
  });
}

export function createApiKeyLoginMutation() {
  return useMutation({
    mutationFn: (data: ApiKeyLoginRequest) =>
      fetchApi<LoginResponse>(`${API_BASE}/auth/login/api-key`, {
        method: "POST",
        body: JSON.stringify(data),
        skipAutoLogoutOnUnauthorized: true,
      }),
  });
}

export function createChangePasswordMutation() {
  return useMutation({
    mutationFn: (data: ChangePasswordRequest) =>
      fetchApi(`${API_BASE}/auth/password`, {
        method: "PUT",
        body: JSON.stringify(data),
        skipAutoLogoutOnUnauthorized: true,
      }),
  });
}

export function createRegenerateApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<ApiKeyResponse>(`${API_BASE}/auth/api-key/regenerate`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.auth.apiKey() });
    },
  });
}

export function renamePreviewQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.renamePreview(id),
    queryFn: ({ signal }) =>
      fetchApi<RenamePreviewItem[]>(`${API_BASE}/anime/${id}/rename-preview`, undefined, signal),
  });
}

export function createRenamePreviewQuery(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    ...renamePreviewQueryOptions(id),
    enabled: options?.enabled ?? true,
  });
}

export function getAnimeEpisodeStreamUrl(animeId: number, episodeNumber: number) {
  return fetchApi<AnimeEpisodeStreamUrl>(
    `${API_BASE}/anime/${animeId}/stream-url?episodeNumber=${episodeNumber}`,
  );
}

export function createExecuteRenameMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchApi<RenameResult>(`${API_BASE}/anime/${id}/rename`, {
        method: "POST",
      }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodes(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}
