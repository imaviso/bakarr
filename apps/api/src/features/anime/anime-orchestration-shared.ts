import { Effect } from "effect";

import type { EventPublisherShape } from "@/features/events/publisher.ts";

export type AnimeEventPublisher = Pick<EventPublisherShape, "publish" | "publishInfo">;

export const quietAnimeEventPublisher: AnimeEventPublisher = {
  publish: () => Effect.void,
  publishInfo: () => Effect.void,
};
