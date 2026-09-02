import { RiArrowLeftLine, RiErrorWarningLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function AnimeError() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden bg-background">
      {/* Content */}
      <div
        className="relative z-10 flex flex-col items-center text-center space-y-8 px-4 animate-in fade-in zoom-in-95"
        style={{ animationDuration: "500ms" }}
      >
        {/* Icon/Visual */}
        <div className="relative">
          <RiErrorWarningLine
            className="h-24 w-24 text-destructive/80 relative z-10"
            strokeWidth={1}
          />
        </div>

        {/* Typography */}
        <div className="space-y-2">
          <h1 className="text-4xl font-thin tracking-tight text-foreground select-none">
            Media Not Found
          </h1>
          <p className="text-sm text-muted-foreground max-w-[400px] mx-auto leading-relaxed">
            The media you are looking for does not exist in your library or an error occurred while
            loading it.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Link to="/media" search={{ q: "", filter: "all", view: "grid" }}>
            <Button variant="outline" className="group">
              <RiArrowLeftLine className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Library
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
