import type { EventBusShape } from "@/features/events/event-bus.ts";

export type MediaEventPublisher = Pick<EventBusShape, "publish" | "publishInfo">;
