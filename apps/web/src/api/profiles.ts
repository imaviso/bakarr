import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  QualityProfile,
  ReleaseProfileCreateRequest,
  ReleaseProfileUpdateRequest,
} from "./contracts";
import { QualityProfileSchema, QualitySchema, ReleaseProfileSchema } from "@bakarr/shared";
import { API_BASE } from "@/api/constants";
import { fetchJson, fetchUnit, runApiEffect } from "@/api/effect/api-client";
import { Schema } from "effect";
import { animeKeys } from "./keys";

export function profilesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.profiles.all,
    queryFn: ({ signal }) =>
      runApiEffect(
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
      runApiEffect(
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
      runApiEffect(
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
      runApiEffect(
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
      runApiEffect(
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
      runApiEffect(
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
      runApiEffect(
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
      runApiEffect(
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
      runApiEffect(fetchUnit(`${API_BASE}/release-profiles/${id}`, { method: "DELETE" })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  });
}
