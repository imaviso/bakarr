import { useEffect, type RefObject } from "react";

/**
 * Subscribes a keydown handler to the window (or a target ref) for the lifetime
 * of the component, without re-subscribing on every handler identity change.
 */
export function useGlobalKeydown(
  handler: (event: KeyboardEvent) => void,
  target?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const el = target?.current ?? window;
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [handler, target]);
}
