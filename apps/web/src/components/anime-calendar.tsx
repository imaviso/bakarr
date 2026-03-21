import {
  IconCaretLeft,
  IconCaretRight,
  IconCheck,
  IconCircle,
} from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { createCalendarQuery, createSystemConfigQuery } from "~/lib/api";
import {
  formatAiringTimeWithPreferences,
  getAiringDisplayDateKey,
  getAiringDisplayPreferences,
} from "~/lib/anime-metadata";
import { cn } from "~/lib/utils";

export function AnimeCalendar() {
  const [currentDate, setCurrentDate] = createSignal(new Date());

  const fetchStart = createMemo(() =>
    subMonths(startOfWeek(startOfMonth(currentDate())), 1)
  );
  const fetchEnd = createMemo(() =>
    addMonths(endOfWeek(endOfMonth(currentDate())), 1)
  );

  const calendarQuery = createCalendarQuery(fetchStart, fetchEnd);
  const configQuery = createSystemConfigQuery();
  const airingPreferences = createMemo(() =>
    getAiringDisplayPreferences(configQuery.data?.library)
  );

  const days = createMemo(() => {
    const monthStart = startOfMonth(currentDate());
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  });

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Optimized: Create a memoized map of events by date for O(1) lookup
  // Returns a lookup function to avoid re-tracking the entire map on each access
  const getEventsForDay = createMemo(() => {
    const events = calendarQuery.data || [];
    const map: Record<string, typeof events> = {};

    for (const event of events) {
      const dateKey = getAiringDisplayDateKey(event.start, airingPreferences());
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(event);
    }

    // Return a stable lookup function that only accesses the specific date
    return (day: Date) => {
      const dateKey = format(day, "yyyy-MM-dd");
      return map[dateKey] || [];
    };
  });

  const handlePrevMonth = () => setCurrentDate((d) => subMonths(d, 1));
  const handleNextMonth = () => setCurrentDate((d) => addMonths(d, 1));
  const handleToday = () => setCurrentDate(new Date());

  return (
    <div class="flex flex-col gap-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevMonth}
            aria-label="Previous month"
          >
            <IconCaretLeft class="h-4 w-4" />
          </Button>
          <h2 class="text-xl font-semibold w-40 text-center">
            {format(currentDate(), "MMMM yyyy")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextMonth}
            aria-label="Next month"
          >
            <IconCaretRight class="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleToday}>
          Today
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card class="overflow-x-auto border-border/50">
        <div class="min-w-0 md:min-w-[800px]">
          {/* Weekday Headers */}
          <div class="grid grid-cols-7 border-b border-border/50 bg-muted/30">
            <For each={weekdays}>
              {(day) => (
                <div class="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {day}
                </div>
              )}
            </For>
          </div>

          {/* Days Grid */}
          <div class="grid grid-cols-7">
            <For each={days()}>
              {(day) => {
                const dayEvents = () => getEventsForDay()(day);
                const isCurrentMonth = () => isSameMonth(day, currentDate());
                const isCurrentDay = isToday(day);

                return (
                  <div
                    class={cn(
                      "min-h-[120px] border-r border-b border-border/30 p-1.5 transition-colors",
                      "last:border-r-0 [&:nth-child(7n)]:border-r-0",
                      !isCurrentMonth() && "bg-muted/20 opacity-50",
                      isCurrentDay && "bg-primary/5",
                    )}
                  >
                    {/* Day Number */}
                    <div class="flex items-center justify-between mb-1">
                      <span
                        class={cn(
                          "text-sm font-medium",
                          isCurrentDay &&
                            "bg-primary text-primary-foreground rounded-none w-6 h-6 flex items-center justify-center",
                          !isCurrentMonth() && "text-muted-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>

                    {/* Events */}
                    <div class="space-y-1">
                      <For each={dayEvents().slice(0, 3)}>
                        {(event) => (
                          (() => {
                            const isMissingEvent =
                              !event.extended_props.downloaded &&
                              event.extended_props.airing_status === "aired";
                            const isUpcomingEvent =
                              !event.extended_props.downloaded &&
                              !isMissingEvent;

                            return (
                              <Link
                                to="/anime/$id"
                                params={{
                                  id: event.extended_props.anime_id.toString(),
                                }}
                                class="block group"
                              >
                                <div
                                  class={cn(
                                    "flex items-center gap-1.5 rounded-none px-1.5 py-1 text-xs transition-colors",
                                    "hover:bg-accent/80 cursor-pointer",
                                    event.extended_props.downloaded
                                      ? "bg-success/10 text-success"
                                      : isMissingEvent
                                      ? "bg-warning/10 text-warning"
                                      : isUpcomingEvent
                                      ? "bg-info/10 text-info"
                                      : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-1">
                                      <Show
                                        when={event.extended_props.downloaded}
                                        fallback={
                                          <IconCircle class="h-3 w-3 flex-shrink-0" />
                                        }
                                      >
                                        <IconCheck class="h-3 w-3 flex-shrink-0" />
                                      </Show>
                                      <span class="truncate font-medium">
                                        {event.extended_props.anime_title}
                                      </span>
                                    </div>
                                    <span class="text-xs opacity-70 truncate block">
                                      <span>
                                        Ep {event.extended_props.episode_number}
                                      </span>
                                      <Show
                                        when={formatAiringTimeWithPreferences(
                                          event.start,
                                          airingPreferences(),
                                        )}
                                      >
                                        {(time) => <span>• {time()}</span>}
                                      </Show>
                                    </span>
                                    <Show
                                      when={event.extended_props.episode_title}
                                    >
                                      <span class="text-xs opacity-70 truncate block">
                                        {event.extended_props.episode_title}
                                      </span>
                                    </Show>
                                  </div>
                                </div>
                              </Link>
                            );
                          })()
                        )}
                      </For>
                      <Show when={dayEvents().length > 3}>
                        <div class="text-xs text-muted-foreground px-1.5">
                          +{dayEvents().length - 3} more
                        </div>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div class="flex items-center gap-4 text-xs text-muted-foreground">
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-none bg-success/20 border border-success/40" />
          <span>Downloaded</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-none bg-info/20 border border-info/40" />
          <span>Upcoming</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-none bg-warning/20 border border-warning/40" />
          <span>Missing</span>
        </div>
      </div>
    </div>
  );
}
