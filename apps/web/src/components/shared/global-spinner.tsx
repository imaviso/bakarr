import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export function GlobalSpinner() {
  const state = useRouterState();
  const [hasBeenIdle, setHasBeenIdle] = useState(state.status === "idle");

  useEffect(() => {
    if (state.status === "idle") {
      setHasBeenIdle(true);
    }
  }, [state.status]);

  const isRouting = !hasBeenIdle && state.status === "pending";

  return (
    <>
      {isRouting && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 transition-opacity duration-300 animate-in fade-in pointer-events-none"
          role="status"
          aria-label="Loading application"
        >
          <div className="relative flex flex-col items-center gap-4">
            <div className="linear-spinner text-primary">
              <svg viewBox="0 0 40 40">
                <title>Loading</title>
                <circle
                  className="opacity-20"
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <circle
                  className="linear-spinner-arc"
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="text-xs font-medium tracking-widest uppercase text-foreground">
              Loading
            </div>
          </div>
        </div>
      )}
    </>
  );
}
