import { Context, Effect, Layer } from "effect";

import type { ReleaseProfile } from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { StoredConfigCorruptError } from "./errors.ts";
import { effectDecodeReleaseProfileRow, encodeReleaseProfileRow } from "./config-codec.ts";
import type { CreateReleaseProfileInput, UpdateReleaseProfileInput } from "./config-schema.ts";
import { appendSystemLog } from "./support.ts";
import {
  deleteReleaseProfileRow,
  insertReleaseProfileRow,
  listReleaseProfileRows,
  updateReleaseProfileRow,
} from "./repository/release-profile-repository.ts";

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
  ) => Effect.Effect<void, DatabaseError>;
  readonly deleteReleaseProfile: (id: number) => Effect.Effect<void, DatabaseError>;
}

export class ReleaseProfileService extends Context.Tag("@bakarr/api/ReleaseProfileService")<
  ReleaseProfileService,
  ReleaseProfileServiceShape
>() {}

const makeReleaseProfileService = Effect.gen(function* () {
  const { db } = yield* Database;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const listReleaseProfiles = Effect.fn("ReleaseProfileService.listReleaseProfiles")(function* () {
    const rows = yield* listReleaseProfileRows(db);
    return yield* Effect.forEach(rows, effectDecodeReleaseProfileRow);
  });

  const createReleaseProfile = Effect.fn("ReleaseProfileService.createReleaseProfile")(function* (
    input: CreateReleaseProfileInput,
  ) {
    const created = yield* insertReleaseProfileRow(db, encodeReleaseProfileRow(input));

    yield* appendSystemLog(
      db,
      "release_profiles.created",
      "success",
      `Release profile '${input.name}' created`,
      nowIso,
    );
    return yield* effectDecodeReleaseProfileRow(created);
  });

  const updateReleaseProfile = Effect.fn("ReleaseProfileService.updateReleaseProfile")(function* (
    id: number,
    input: UpdateReleaseProfileInput,
  ) {
    yield* updateReleaseProfileRow(db, id, encodeReleaseProfileRow(input));

    yield* appendSystemLog(
      db,
      "release_profiles.updated",
      "success",
      `Release profile '${input.name}' updated`,
      nowIso,
    );
  });

  const deleteReleaseProfile = Effect.fn("ReleaseProfileService.deleteReleaseProfile")(function* (
    id: number,
  ) {
    yield* deleteReleaseProfileRow(db, id);
    yield* appendSystemLog(
      db,
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
  makeReleaseProfileService,
);
