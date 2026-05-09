import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

interface GeneralErrorProps {
  error?: Error;
}

export function GeneralError(props: GeneralErrorProps) {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex min-h-[400px] flex-1 flex-col items-center justify-center bg-background">
      <div className="flex w-full max-w-xl flex-col items-start gap-6 px-4 text-left">
        <div className="font-mono text-xs text-muted-foreground">
          <span className="text-foreground">bakarr</span> render --route
        </div>

        <div className="w-full border-l-2 border-l-destructive bg-card pl-3 font-mono text-xs">
          <div className="text-destructive">error[E_RUNTIME]: an unexpected exception occurred</div>
          <div className="mt-1 text-muted-foreground">
            try refreshing the page or come back later
          </div>
        </div>

        {props.error && (
          <div className="w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="font-mono text-xs text-muted-foreground"
            >
              {showDetails ? "[-] hide trace" : "[+] show trace"}
            </Button>
            {showDetails && (
              <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap break-all border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">
                {props.error.message}
                {props.error.stack && `\n\n${props.error.stack}`}
              </pre>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => globalThis.location.reload()}>
            Refresh
          </Button>
          <Button variant="ghost" className="group" onClick={() => navigate({ to: "/" })}>
            <ArrowLeftIcon className="mr-1.5 h-4 w-4 transition-transform group-hover:-translate-x-1" />
            cd ~
          </Button>
        </div>
      </div>
    </div>
  );
}
