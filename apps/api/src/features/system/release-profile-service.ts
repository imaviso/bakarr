import { Effect } from "effect";

import { nowIso as currentNowIso } from "@/infra/time.ts";
import {
  decodeReleaseProfileRow,
  encodeReleaseProfileRow,
} from "@/features/system/profile-codec.ts";
import type {
  CreateReleaseProfileInput,
  UpdateReleaseProfileInput,
} from "@/features/system/config-schema.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";

const makeReleaseProfileService = Effect.fn("ReleaseProfileService.make")(function* () {
  const releaseProfileRepository = yield* ReleaseProfileRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const nowIso = currentNowIso;

  const listReleaseProfiles = Effect.fn("ReleaseProfileService.listReleaseProfiles")(function* () {
    const rows = yield* releaseProfileRepository.listReleaseProfileRows();
    return yield* Effect.forEach(rows, decodeReleaseProfileRow);
  });

  const createReleaseProfile = Effect.fn("ReleaseProfileService.createReleaseProfile")(function* (
    input: CreateReleaseProfileInput,
  ) {
    const row = yield* encodeReleaseProfileRow(input);
    const created = yield* releaseProfileRepository.insertReleaseProfileRow(row);

    yield* systemLogRepository.appendLog(
      "release_profiles.created",
      "success",
      `Release profile '${input.name}' created`,
      nowIso,
    );
    return yield* decodeReleaseProfileRow(created);
  });

  const updateReleaseProfile = Effect.fn("ReleaseProfileService.updateReleaseProfile")(function* (
    id: number,
    input: UpdateReleaseProfileInput,
  ) {
    const row = yield* encodeReleaseProfileRow(input);
    yield* releaseProfileRepository.updateReleaseProfileRow(id, row);

    yield* systemLogRepository.appendLog(
      "release_profiles.updated",
      "success",
      `Release profile '${input.name}' updated`,
      nowIso,
    );
  });

  const deleteReleaseProfile = Effect.fn("ReleaseProfileService.deleteReleaseProfile")(function* (
    id: number,
  ) {
    yield* releaseProfileRepository.deleteReleaseProfileRow(id);
    yield* systemLogRepository.appendLog(
      "release_profiles.deleted",
      "success",
      `Release profile ${id} deleted`,
      nowIso,
    );
  });

  return {
    listReleaseProfiles,
    createReleaseProfile,
    updateReleaseProfile,
    deleteReleaseProfile,
  };
});

export class ReleaseProfileService extends Effect.Service<ReleaseProfileService>()(
  "@bakarr/api/ReleaseProfileService",
  {
    effect: makeReleaseProfileService(),
    dependencies: [ReleaseProfileRepository.Default, SystemLogRepository.Default],
  },
) {}

export const ReleaseProfileServiceLive = ReleaseProfileService.Default;
