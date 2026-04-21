import { CaretLeftIcon, CaretRightIcon, CheckIcon, CircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
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
import { useMemo, useState } from "react";
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
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchStart = useMemo(
    () => subMonths(startOfWeek(startOfMonth(currentDate)), 1),
    [currentDate],
  );
  const fetchEnd = useMemo(() => addMonths(endOfWeek(endOfMonth(currentDate)), 1), [currentDate]);

  const calendarQuery = createCalendarQuery(fetchStart, fetchEnd);
  const configQuery = createSystemConfigQuery();
  const airingPreferences = useMemo(
    () => getAiringDisplayPreferences(configQuery.data?.library),
    [configQuery.data?.library],
  );

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Optimized: Create a memoized map of events by date for O(1) lookup
  // Returns a lookup function to avoid re-tracking the entire map on each access
  const getEventsForDay = useMemo(() => {
    const events = calendarQuery.data || [];
    const map: Record<string, typeof events> = {};

    for (const event of events) {
      const dateKey = getAiringDisplayDateKey(event.start, airingPreferences);
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
  }, [calendarQuery.data, airingPreferences]);

  const handlePrevMonth = () => setCurrentDate((d) => subMonths(d, 1));
  const handleNextMonth = () => setCurrentDate((d) => addMonths(d, 1));
  const handleToday = () => setCurrentDate(new Date());

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} aria-label="Previous month">
            <CaretLeftIcon className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold w-40 text-center">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} aria-label="Next month">
            <CaretRightIcon className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleToday}>
          Today
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card className="overflow-x-auto border-border">
        <div className="min-w-0 md:min-w-[800px]">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted">
            {weekdays.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={format(day, "yyyy-MM-dd")}
                  className={cn(
                    "min-h-[120px] border-r border-b border-border p-1.5 transition-colors",
                    "last:border-r-0 [&:nth-child(7n)]:border-r-0",
                    !isCurrentMonth && "bg-muted opacity-50",
                    isCurrentDay && "bg-primary/10",
                  )}
                >
                  {/* Day Number */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isCurrentDay &&
                          "bg-primary text-primary-foreground rounded-none w-6 h-6 flex items-center justify-center",
                        !isCurrentMonth && "text-muted-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => {
                      const isMissingEvent =
                        !event.extended_props.downloaded &&
                        event.extended_props.airing_status === "aired";
                      const isUpcomingEvent = !event.extended_props.downloaded && !isMissingEvent;

                      return (
                        <Link
                          key={`${event.extended_props.anime_id}-${event.extended_props.episode_number}-${event.start}`}
                          to="/anime/$id"
                          params={{
                            id: event.extended_props.anime_id.toString(),
                          }}
                          className="block group"
                        >
                          <div
                            className={cn(
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
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                {event.extended_props.downloaded ? (
                                  <CheckIcon className="h-3 w-3 flex-shrink-0" />
                                ) : (
                                  <CircleIcon className="h-3 w-3 flex-shrink-0" />
                                )}
                                <span className="truncate font-medium">
                                  {event.extended_props.anime_title}
                                </span>
                              </div>
                              <span className="text-xs opacity-70 truncate block">
                                <span>Ep {event.extended_props.episode_number}</span>
                                {formatAiringTimeWithPreferences(
                                  event.start,
                                  airingPreferences,
                                ) && (
                                  <span>
                                    {" "}
                                    •{" "}
                                    {formatAiringTimeWithPreferences(
                                      event.start,
                                      airingPreferences,
                                    )}
                                  </span>
                                )}
                              </span>
                              {event.extended_props.episode_title && (
                                <span className="text-xs opacity-70 truncate block">
                                  {event.extended_props.episode_title}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-muted-foreground px-1.5">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-none bg-success/20 border border-success/40" />
          <span>Downloaded</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-none bg-info/20 border border-info/40" />
          <span>Upcoming</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-none bg-warning/20 border border-warning/40" />
          <span>Missing</span>
        </div>
      </div>
    </div>
  );
}
