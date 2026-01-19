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
	isSameDay,
	isSameMonth,
	isToday,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { createCalendarQuery } from "~/lib/api";
import { cn } from "~/lib/utils";

export function AnimeCalendar() {
	const [currentDate, setCurrentDate] = createSignal(new Date());

	const fetchStart = createMemo(() =>
		subMonths(startOfWeek(startOfMonth(currentDate())), 1),
	);
	const fetchEnd = createMemo(() =>
		addMonths(endOfWeek(endOfMonth(currentDate())), 1),
	);

	const calendarQuery = createCalendarQuery(fetchStart, fetchEnd);

	const days = createMemo(() => {
		const monthStart = startOfMonth(currentDate());
		const monthEnd = endOfMonth(monthStart);
		const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
		const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
		return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
	});

	const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	const getEventsForDay = (day: Date) => {
		return (
			calendarQuery.data?.filter((event) => {
				const eventDate = new Date(event.start);
				return isSameDay(day, eventDate);
			}) || []
		);
	};

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
						class="h-8 w-8"
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
						class="h-8 w-8"
					>
						<IconCaretRight class="h-4 w-4" />
					</Button>
				</div>
				<Button variant="outline" size="sm" onClick={handleToday}>
					Today
				</Button>
			</div>

			<Show when={calendarQuery.isLoading}>
				<div class="flex h-[400px] items-center justify-center">
					<div class="linear-spinner h-8 w-8 text-primary">
						<div class="linear-spinner-arc" />
					</div>
				</div>
			</Show>

			<Show when={!calendarQuery.isLoading}>
				{/* Calendar Grid */}
				<Card class="overflow-hidden border-border/50">
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
								const dayEvents = getEventsForDay(day);
								const isCurrentMonth = isSameMonth(day, currentDate());
								const isCurrentDay = isToday(day);

								return (
									<div
										class={cn(
											"min-h-[120px] border-r border-b border-border/30 p-1.5 transition-colors",
											"last:border-r-0 [&:nth-child(7n)]:border-r-0",
											!isCurrentMonth && "bg-muted/20 opacity-50",
											isCurrentDay && "bg-primary/5",
										)}
									>
										{/* Day Number */}
										<div class="flex items-center justify-between mb-1">
											<span
												class={cn(
													"text-sm font-medium",
													isCurrentDay &&
														"bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
													!isCurrentMonth && "text-muted-foreground",
												)}
											>
												{format(day, "d")}
											</span>
										</div>

										{/* Events */}
										<div class="space-y-1">
											<For each={dayEvents.slice(0, 3)}>
												{(event) => (
													<Link
														to="/anime/$id"
														params={{
															id: event.extended_props.anime_id.toString(),
														}}
														class="block group"
													>
														<div
															class={cn(
																"flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-all",
																"hover:bg-accent/80 cursor-pointer",
																event.extended_props.downloaded
																	? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
																	: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
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
																<span class="text-[10px] opacity-70 truncate block">
																	Ep {event.extended_props.episode_number}
																</span>
															</div>
														</div>
													</Link>
												)}
											</For>
											<Show when={dayEvents.length > 3}>
												<div class="text-[10px] text-muted-foreground px-1.5">
													+{dayEvents.length - 3} more
												</div>
											</Show>
										</div>
									</div>
								);
							}}
						</For>
					</div>
				</Card>
			</Show>

			{/* Legend */}
			<div class="flex items-center gap-4 text-xs text-muted-foreground">
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
					<span>Downloaded</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-violet-500/20 border border-violet-500/40" />
					<span>Missing</span>
				</div>
			</div>
		</div>
	);
}
