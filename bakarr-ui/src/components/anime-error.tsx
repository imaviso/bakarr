import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { Button } from "~/components/ui/button";

export function AnimeError() {
	return (
		<div class="h-full w-full flex flex-col items-center justify-center relative overflow-hidden bg-background">
			{/* Background Ambience - Error Red/Orange */}
			<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-destructive/5 rounded-full blur-3xl pointer-events-none" />

			{/* Content */}
			<div class="relative z-10 flex flex-col items-center text-center space-y-8 px-4 animate-in fade-in zoom-in duration-500">
				{/* Icon/Visual */}
				<div class="relative">
					<div class="absolute inset-0 bg-destructive/10 blur-xl rounded-full" />
					<IconAlertTriangle
						class="h-24 w-24 text-destructive/80 relative z-10"
						stroke-width={1}
					/>
				</div>

				{/* Typography */}
				<div class="space-y-2">
					<h1 class="text-4xl font-thin tracking-tight text-foreground select-none">
						Anime Not Found
					</h1>
					<p class="text-sm text-muted-foreground max-w-[400px] mx-auto leading-relaxed">
						The anime you are looking for does not exist in your library or an
						error occurred while loading it.
					</p>
				</div>

				{/* Actions */}
				<div class="flex items-center gap-4">
					<Link to="/anime">
						<Button variant="outline" class="group">
							<IconArrowLeft class="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
							Back to Library
						</Button>
					</Link>
				</div>
			</div>

			{/* Decorative grid pattern */}
			<div class="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
		</div>
	);
}
