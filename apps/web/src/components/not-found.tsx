import { IconArrowLeft, IconGhost } from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { Button } from "~/components/ui/button";

export function NotFound() {
  return (
    <div class="h-screen w-screen fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div class="flex flex-col items-center text-center space-y-8 px-4 animate-in fade-in zoom-in duration-500">
        <IconGhost
          class="h-24 w-24 text-primary/80"
          stroke-width={1}
        />

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

        <div class="flex items-center gap-4">
          <Link to="/">
            <Button variant="outline" class="group">
              <IconArrowLeft class="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
