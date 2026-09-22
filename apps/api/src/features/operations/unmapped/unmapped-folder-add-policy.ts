import type { AddMediaInput } from "@/features/media/add/add-media-input.ts";
import { brandMediaId, type MediaIdSpace, type MediaKind } from "@packages/shared/index.ts";

/** Server-owned add policy for enrolling a media from an unmapped-folder match. */
export const ADD_FOLDER_MATCH_POLICY = {
  monitor_and_search: false,
  monitored: true,
  use_existing_root: true,
};

export function buildFolderMatchEnrollmentInput(input: {
  candidateId: number;
  candidateIdSpace?: MediaIdSpace | undefined;
  candidateMediaKind?: MediaKind | undefined;
  profileName: string;
  rootFolder: string;
}): AddMediaInput {
  const policy: AddMediaInput = {
    id: brandMediaId(input.candidateId),
    ...(input.candidateIdSpace === undefined ? {} : { id_space: input.candidateIdSpace }),
    ...(input.candidateMediaKind === undefined ? {} : { media_kind: input.candidateMediaKind }),
    monitor_and_search: ADD_FOLDER_MATCH_POLICY.monitor_and_search,
    monitored: ADD_FOLDER_MATCH_POLICY.monitored,
    profile_name: input.profileName,
    release_profile_ids: [],
    root_folder: input.rootFolder,
    use_existing_root: ADD_FOLDER_MATCH_POLICY.use_existing_root,
  };
  return policy;
}
