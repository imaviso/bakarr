import { RiArrowLeftLine } from "@remixicon/react";
import { useState } from "react";
import { useNavigate, type ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function GeneralError(props: ErrorComponentProps) {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const error = props.error instanceof Error ? props.error : undefined;

  return (
    <div className="flex min-h-100 flex-1 flex-col items-center justify-center bg-background">
      <div className="flex w-full max-w-xl flex-col items-start gap-6 px-4 text-left">
        <div className="font-mono text-xs text-muted-foreground">
          <span className="text-foreground">bakarr</span> render --route
        </div>

        <div className="w-full border border-destructive/40 bg-destructive/5 px-3 py-2 font-mono text-xs">
          <div className="flex items-baseline gap-2 text-destructive">
            <span aria-hidden="true">!</span>
            <span>error[E_RUNTIME]: an unexpected exception occurred</span>
          </div>
          <div className="mt-1 text-muted-foreground">
            try refreshing the page or come back later
          </div>
        </div>

        {error && (
          <div className="w-full">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setShowDetails(!showDetails)}
              className="font-mono text-xs text-muted-foreground"
            >
              {showDetails ? "[-] hide trace" : "[+] show trace"}
            </Button>
            {showDetails && (
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" onPress={() => globalThis.location.reload()}>
            Refresh
          </Button>
          <Button variant="ghost" className="group" onPress={() => navigate({ to: "/" })}>
            <RiArrowLeftLine className="mr-1.5 h-4 w-4 transition-transform group-hover:-translate-x-1" />
            cd ~
          </Button>
        </div>
      </div>
    </div>
  );
}
