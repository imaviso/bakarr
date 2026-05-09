import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

export function NotFound() {
  const location = useLocation();

  return (
    <div className="flex min-h-[400px] flex-1 flex-col items-center justify-center bg-background">
      <div className="flex w-full max-w-xl flex-col items-start gap-6 px-4 text-left">
        <div className="font-mono text-xs text-muted-foreground">
          <span className="text-foreground">cat</span> {location.pathname}
        </div>

        <div className="w-full border-l-2 border-l-warning bg-card pl-3 font-mono text-xs">
          <div className="text-warning">404: no such file or directory</div>
          <div className="mt-1 text-muted-foreground">check the url or navigate back home</div>
        </div>

        <pre className="select-none font-mono text-xs leading-tight text-muted-foreground/60">
          {`╭─ status ──────────╮
│ code  : 404       │
│ route : not found │
╰───────────────────╯`}
        </pre>

        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="outline" className="group">
              <ArrowLeftIcon className="mr-1.5 h-4 w-4 transition-transform group-hover:-translate-x-1" />
              cd ~
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
