import { useLayoutEffect } from "react";

const APP_NAME = "Bakarr";

/**
 * Sets document.title reactively. Restores the previous title on cleanup.
 * Usage: `usePageTitle("Dashboard")` → "Dashboard — Bakarr"
 */
export function usePageTitle(title: string | undefined) {
  useLayoutEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
