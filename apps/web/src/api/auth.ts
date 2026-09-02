import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiKeyLoginRequest, ChangePasswordRequest, LoginRequest } from "./contracts";
import { AuthUserSchema, ApiKeyResponseSchema, LoginResponseSchema } from "@bakarr/shared";
import { API_BASE } from "@/api/constants";
import { fetchJson, fetchUnit, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";

export function authMeQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.me(),
    queryFn: ({ signal }) =>
      runApiEffect(fetchJson(AuthUserSchema, `${API_BASE}/auth/me`, undefined, signal)),
    staleTime: Infinity,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { isAuth: true },
    mutationFn: (data: LoginRequest) =>
      runApiEffect(
        fetchJson(LoginResponseSchema, `${API_BASE}/auth/login`, {
          method: "POST",
          body: data,
        }),
      ),
    // The router guard serves ["auth","me"] with staleTime Infinity; a fresh
    // login must drop the previous user's cached entry.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.auth.me() });
    },
  });
}

export function useApiKeyLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { isAuth: true },
    mutationFn: (data: ApiKeyLoginRequest) =>
      runApiEffect(
        fetchJson(LoginResponseSchema, `${API_BASE}/auth/login/api-key`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.auth.me() });
    },
  });
}

export function useChangePasswordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { isAuth: true },
    mutationFn: (data: ChangePasswordRequest) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/auth/password`, {
          method: "PUT",
          body: data,
        }),
      ),
    // Password change clears every server session; drop the cached user so
    // the guard refetches instead of trusting the now-signed-out identity.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.auth.me() });
    },
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
    onSuccess: (data) => {
      queryClient.setQueryData(animeKeys.auth.apiKey(), data);
    },
  });
}
