import { Effect } from "effect";
import type { AuthUser } from "../../../../packages/shared/src/index.ts";
import type { ApiContext } from "../runtime.ts";

export type RunEffect = <A, E>(
  effect: Effect.Effect<A, E, ApiContext>,
) => Promise<A>;

export type AppVariables = {
  requestId: string;
  viewer: AuthUser | null;
};

export interface RouteErrorResponse {
  readonly headers?: Record<string, string>;
  readonly message: string;
  readonly status: number;
}
