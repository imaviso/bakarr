import { WarningCircleIcon, ArrowLeftIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

export function GeneralError() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[400px] bg-background">
      <div className="flex flex-col items-center text-center space-y-8 px-4">
        <WarningCircleIcon className="h-24 w-24 text-destructive/80" strokeWidth={1} />

        <div className="space-y-2">
          <h1 className="text-4xl font-thin tracking-tight text-foreground select-none">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground max-w-[400px] mx-auto leading-relaxed">
            An unexpected error occurred while loading this page. Please try refreshing or come back
            later.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="outline" className="group" onClick={() => globalThis.location.reload()}>
            Refresh Page
          </Button>
          <Link to="/">
            <Button variant="ghost" className="group">
              <ArrowLeftIcon className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
