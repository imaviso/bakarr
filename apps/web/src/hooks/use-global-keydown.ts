import { useEffect, useRef, type RefObject } from "react";

/**
 * Subscribes a keydown handler to the window (or a target ref). Keeps handler
 * fresh via ref to avoid re-subscribing on every render.
 */
export function useGlobalKeydown(
  handler: (event: KeyboardEvent) => void,
  target?: RefObject<HTMLElement | null>,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const wrapped = (event: KeyboardEvent) => handlerRef.current(event);

    // If a target ref is provided, wait until it resolves; subscribe to whichever
    // is available. Re-subscribe when target.current changes (polled via effect).
    const node = target?.current;
    if (target !== undefined) {
      if (node) {
        node.addEventListener("keydown", wrapped);
        return () => node.removeEventListener("keydown", wrapped);
      }
      // Target provided but not yet mounted — fall back to window until mounted.
      // Effect will re-run when target changes identity or on next render via
      // lack of cleanup trigger; keep window subscription as fallback.
      window.addEventListener("keydown", wrapped);
      return () => window.removeEventListener("keydown", wrapped);
    }

    window.addEventListener("keydown", wrapped);
    return () => window.removeEventListener("keydown", wrapped);
  }, [target]);
}
