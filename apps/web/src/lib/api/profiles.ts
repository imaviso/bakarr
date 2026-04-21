import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Quality,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileCreateRequest,
  ReleaseProfileUpdateRequest,
} from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function profilesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.profiles.all,
    queryFn: ({ signal }) => fetchApi<QualityProfile[]>(`${API_BASE}/profiles`, undefined, signal),
    staleTime: Infinity,
  });
}

export function createProfilesQuery(enabled: boolean = true) {
  return useQuery({ ...profilesQueryOptions(), enabled });
}

export function qualitiesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.profiles.qualities(),
    queryFn: ({ signal }) =>
      fetchApi<Quality[]>(`${API_BASE}/profiles/qualities`, undefined, signal),
    staleTime: Infinity,
  });
}

export function createQualitiesQuery() {
  return useQuery(qualitiesQueryOptions());
}

export function releaseProfilesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.releaseProfiles,
    queryFn: ({ signal }) =>
      fetchApi<ReleaseProfile[]>(`${API_BASE}/release-profiles`, undefined, signal),
    staleTime: 1000 * 60 * 60,
  });
}

export function createReleaseProfilesQuery(enabled: boolean = true) {
  return useQuery({
    ...releaseProfilesQueryOptions(),
    enabled,
  });
}

export function createCreateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: QualityProfile) =>
      fetchApi<QualityProfile>(`${API_BASE}/profiles`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  });
}

export function createUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, profile }: { name: string; profile: QualityProfile }) =>
      fetchApi<QualityProfile>(`${API_BASE}/profiles/${name}`, {
        method: "PUT",
        body: JSON.stringify(profile),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  });
}

export function createDeleteProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => fetchApi(`${API_BASE}/profiles/${name}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  });
}

export function createCreateReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReleaseProfileCreateRequest) =>
      fetchApi<ReleaseProfile>(`${API_BASE}/release-profiles`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  });
}

export function createUpdateReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReleaseProfileUpdateRequest }) =>
      fetchApi(`${API_BASE}/release-profiles/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  });
}

export function createDeleteReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchApi(`${API_BASE}/release-profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  });
}
