import { Context, Effect, Layer } from "effect";

import type { ReleaseProfile } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import {
  decodeReleaseProfileRow,
  encodeReleaseProfileRow,
} from "@/features/profiles/profile-codec.ts";
import type {
  CreateReleaseProfileInput,
  UpdateReleaseProfileInput,
} from "@/features/system/config-schema.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";

export interface ReleaseProfileServiceShape {
  readonly listReleaseProfiles: () => Effect.Effect<
    ReleaseProfile[],
    DatabaseError | StoredConfigCorruptError
  >;
  readonly createReleaseProfile: (
    input: CreateReleaseProfileInput,
  ) => Effect.Effect<ReleaseProfile, DatabaseError | StoredConfigCorruptError>;
  readonly updateReleaseProfile: (
    id: number,
    input: UpdateReleaseProfileInput,
  ) => Effect.Effect<void, DatabaseError | StoredConfigCorruptError>;
  readonly deleteReleaseProfile: (id: number) => Effect.Effect<void, DatabaseError>;
}

export class ReleaseProfileService extends Context.Tag("@bakarr/api/ReleaseProfileService")<
  ReleaseProfileService,
  ReleaseProfileServiceShape
>() {}

const makeReleaseProfileService = Effect.fn("ReleaseProfileService.make")(function* () {
  const clock = yield* ClockService;
  const releaseProfileRepository = yield* ReleaseProfileRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const nowIso = () => nowIsoFromClock(clock);

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
  } satisfies ReleaseProfileServiceShape;
});

export const ReleaseProfileServiceLive = Layer.effect(
  ReleaseProfileService,
  makeReleaseProfileService(),
);
