import type { EventBusShape } from "@/features/events/event-bus.ts";

export type AnimeEventPublisher = Pick<EventBusShape, "publish" | "publishInfo">;
