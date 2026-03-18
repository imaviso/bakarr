import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { Button } from "~/components/ui/button";

export function AnimeError() {
  return (
    <div class="h-full w-full flex flex-col items-center justify-center relative overflow-hidden bg-background">
      {/* Content */}
      <div class="relative z-10 flex flex-col items-center text-center space-y-8 px-4 animate-in fade-in zoom-in duration-500">
        {/* Icon/Visual */}
        <div class="relative">
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
          <Link to="/anime" search={{ q: "", filter: "all", view: "grid" }}>
            <Button variant="outline" class="group">
              <IconArrowLeft class="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Library
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
