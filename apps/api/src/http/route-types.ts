import { Effect } from "effect";
import type { AuthUser } from "../../../../packages/shared/src/index.ts";

export type RunEffect = <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;

export type AppVariables = {
  requestId: string;
  viewer: AuthUser | null;
};
