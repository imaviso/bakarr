import { IconAlertCircle, IconArrowLeft } from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { Button } from "~/components/ui/button";

export function GeneralError() {
  return (
    <div class="h-screen w-screen fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div class="flex flex-col items-center text-center space-y-8 px-4 animate-in fade-in zoom-in duration-500">
        <IconAlertCircle
          class="h-24 w-24 text-destructive/80"
          stroke-width={1}
        />

        <div class="space-y-2">
          <h1 class="text-4xl font-thin tracking-tight text-foreground select-none">
            Something went wrong
          </h1>
          <p class="text-sm text-muted-foreground max-w-[400px] mx-auto leading-relaxed">
            An unexpected error occurred while loading this page. Please try
            refreshing or come back later.
          </p>
        </div>

        <div class="flex items-center gap-4">
          <Button
            variant="outline"
            class="group"
            onClick={() => globalThis.location.reload()}
          >
            Refresh Page
          </Button>
          <Link to="/">
            <Button variant="ghost" class="group">
              <IconArrowLeft class="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
