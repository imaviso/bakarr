import { useRouterState } from "@tanstack/solid-router";
import { Show } from "solid-js";

export function GlobalSpinner() {
	const state = useRouterState();
	const isRouting = () => state().status === "pending";

	return (
		<Show when={isRouting()}>
			<div class="fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-[2px] transition-all duration-300 animate-in fade-in">
				<div class="relative flex flex-col items-center gap-4">
					<div class="linear-spinner text-primary">
						<svg viewBox="0 0 40 40">
							<circle
								class="opacity-20"
								cx="20"
								cy="20"
								r="18"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
							/>
							<circle
								class="linear-spinner-arc"
								cx="20"
								cy="20"
								r="18"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								stroke-linecap="round"
							/>
						</svg>
					</div>
					<div class="text-[11px] font-semibold tracking-[0.2em] uppercase text-foreground/80 animate-pulse">
						Loading
					</div>
				</div>
			</div>
		</Show>
	);
}
