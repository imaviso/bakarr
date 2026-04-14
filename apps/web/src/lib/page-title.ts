import { createEffect, onCleanup } from "solid-js";

const APP_NAME = "Bakarr";

/**
 * Sets document.title reactively. Restores the previous title on cleanup.
 * Usage: `usePageTitle(() => "Dashboard")` → "Dashboard — Bakarr"
 */
export function usePageTitle(title: () => string | undefined) {
  createEffect(() => {
    const segment = title();
    const prev = document.title;
    document.title = segment ? `${segment} — ${APP_NAME}` : APP_NAME;
    onCleanup(() => {
      document.title = prev;
    });
  });
}
