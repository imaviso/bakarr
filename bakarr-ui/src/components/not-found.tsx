import { IconArrowLeft, IconGhost } from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { Button } from "~/components/ui/button";

export function NotFound() {
	return (
		<div class="h-screen w-screen fixed inset-0 z-50 flex flex-col items-center justify-center relative overflow-hidden bg-background">
			{/* Background Ambience - "Linear-like" glow */}
			<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

			{/* Content */}
			<div class="relative z-10 flex flex-col items-center text-center space-y-8 px-4 animate-in fade-in zoom-in duration-500">
				{/* Icon/Visual */}
				<div class="relative">
					<div class="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
					<IconGhost
						class="h-24 w-24 text-primary/80 relative z-10"
						stroke-width={1}
					/>
				</div>

				{/* Typography */}
				<div class="space-y-2">
					<h1 class="text-7xl font-thin tracking-tight text-foreground select-none">
						404
					</h1>
					<h2 class="text-xl font-medium tracking-wide text-foreground/80">
						Page not found
					</h2>
					<p class="text-sm text-muted-foreground max-w-[400px] mx-auto leading-relaxed">
						The page you are looking for does not exist or has been moved.
						Please check the URL or navigate back home.
					</p>
				</div>

				{/* Actions */}
				<div class="flex items-center gap-4">
					<Link to="/">
						<Button variant="outline" class="group">
							<IconArrowLeft class="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
							Back to Home
						</Button>
					</Link>
				</div>
			</div>

			{/* Decorative grid pattern (optional, mimicking Linear's technical feel) */}
			<div class="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
		</div>
	);
}
