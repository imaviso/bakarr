import { Link, useLocation } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

export function Breadcrumb() {
	const location = useLocation();

	return (
		<nav class="flex items-center gap-2">
			<Show when={location().pathname === "/"}>
				<span class="text-sm font-medium">Dashboard</span>
			</Show>
			<Show when={location().pathname !== "/"}>
				<For each={location().pathname.split("/").filter(Boolean)}>
					{(segment, index) => {
						const segments = location().pathname.split("/").filter(Boolean);
						const path = `/${segments.slice(0, index() + 1).join("/")}`;
						const isLast = index() === segments.length - 1;
						const label = segment.charAt(0).toUpperCase() + segment.slice(1);

						return (
							<span class="flex items-center gap-2">
								<Show when={index() > 0}>
									<span class="text-muted-foreground/50">/</span>
								</Show>
								<Show
									when={!isLast}
									fallback={<span class="text-sm font-medium">{label}</span>}
								>
									<Link
										to={path}
										class="text-sm text-muted-foreground hover:text-foreground transition-colors"
									>
										{label}
									</Link>
								</Show>
							</span>
						);
					}}
				</For>
			</Show>
		</nav>
	);
}
