import { ArrowLeftIcon, GhostIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

export function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[400px] bg-background">
      <div className="flex flex-col items-center text-center space-y-8 px-4">
        <GhostIcon className="h-24 w-24 text-primary" />

        <div className="space-y-2">
          <h1 className="text-7xl font-thin tracking-tight text-foreground select-none">404</h1>
          <h2 className="text-xl font-medium tracking-wide text-foreground">Page not found</h2>
          <p className="text-sm text-muted-foreground max-w-[400px] mx-auto leading-relaxed">
            The page you are looking for does not exist or has been moved. Please check the URL or
            navigate back home.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="outline" className="group">
              <ArrowLeftIcon className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
