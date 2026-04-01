import type { EventPublisherShape } from "@/features/events/publisher.ts";

export type AnimeEventPublisher = Pick<EventPublisherShape, "publish" | "publishInfo">;
