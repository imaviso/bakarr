import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  QualityProfile,
  ReleaseProfileCreateRequest,
  ReleaseProfileUpdateRequest,
} from "./contracts";
import { QualityProfileSchema, QualitySchema, ReleaseProfileSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { Effect, Schema } from "effect";
import { animeKeys } from "./keys";

export function profilesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.profiles.all,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(Schema.Array(QualityProfileSchema), `${API_BASE}/profiles`, undefined, signal),
      ),
    staleTime: Infinity,
  });
}

export function useProfilesQuery(enabled: boolean = true) {
  return useQuery({ ...profilesQueryOptions(), enabled });
}

export function qualitiesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.profiles.qualities(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(Schema.Array(QualitySchema), `${API_BASE}/profiles/qualities`, undefined, signal),
      ),
    staleTime: Infinity,
  });
}

export function useQualitiesQuery() {
  return useQuery(qualitiesQueryOptions());
}

export function releaseProfilesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.releaseProfiles,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(ReleaseProfileSchema),
          `${API_BASE}/release-profiles`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 60,
  });
}

export function useReleaseProfilesQuery(enabled: boolean = true) {
  return useQuery({
    ...releaseProfilesQueryOptions(),
    enabled,
  });
}

export function useCreateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: QualityProfile) =>
      Effect.runPromise(
        fetchJson(QualityProfileSchema, `${API_BASE}/profiles`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, profile }: { name: string; profile: QualityProfile }) =>
      Effect.runPromise(
        fetchJson(QualityProfileSchema, `${API_BASE}/profiles/${encodeURIComponent(name)}`, {
          method: "PUT",
          body: profile,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  });
}

export function useDeleteProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/profiles/${encodeURIComponent(name)}`, { method: "DELETE" }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  });
}

export function useCreateReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReleaseProfileCreateRequest) =>
      Effect.runPromise(
        fetchJson(ReleaseProfileSchema, `${API_BASE}/release-profiles`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  });
}

export function useUpdateReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReleaseProfileUpdateRequest }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/release-profiles/${id}`, {
          method: "PUT",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  });
}

export function useDeleteReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      Effect.runPromise(fetchUnit(`${API_BASE}/release-profiles/${id}`, { method: "DELETE" })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  });
}
