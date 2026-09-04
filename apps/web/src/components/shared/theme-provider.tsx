import { useEffect, useEffectEvent, useLayoutEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
};

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES = new Set<string>(["dark", "light", "system"]);

const listeners = new Set<() => void>();
let currentTheme: Theme = "system";
let themeStorageKey = "theme";
let disableTransitionsOnChange = true;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false;
  }
  return THEME_VALUES.has(value);
}

export function getTheme(): Theme {
  return currentTheme;
}

export function subscribeTheme(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
}

function getSystemThemeSnapshot() {
  return resolveSystemTheme();
}

function subscribeSystemTheme(callback: () => void) {
  const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeSystemTheme, getSystemThemeSnapshot, () => "light");
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  let removed = false;
  let firstFrame: number | undefined;
  let secondFrame: number | undefined;

  const remove = () => {
    if (removed) return;
    removed = true;
    style.remove();
    if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame);
    if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
  };

  firstFrame = window.requestAnimationFrame(() => {
    window.getComputedStyle(document.body);
    secondFrame = window.requestAnimationFrame(remove);
  });

  return remove;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const editableParent = target.closest("input, textarea, select, [contenteditable='true']");
  if (editableParent) {
    return true;
  }

  return false;
}

function applyThemeToDocument(nextResolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  const cleanupTransitions = disableTransitionsOnChange
    ? disableTransitionsTemporarily()
    : undefined;

  root.classList.remove("light", "dark");
  root.classList.add(nextResolvedTheme);
  root.style.colorScheme = nextResolvedTheme;

  return cleanupTransitions ?? (() => {});
}

export function setTheme(nextTheme: Theme) {
  localStorage.setItem(themeStorageKey, nextTheme);
  currentTheme = nextTheme;
  emit();
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
}: ThemeProviderProps) {
  themeStorageKey = storageKey;
  disableTransitionsOnChange = disableTransitionOnChange;

  const storedTheme = localStorage.getItem(storageKey);
  currentTheme = isTheme(storedTheme) ? storedTheme : defaultTheme;

  const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);
  const systemTheme = useSystemTheme();
  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  useLayoutEffect(() => {
    return applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setThemeOnKeydown = useEffectEvent(() => {
    const nextTheme: Theme =
      theme === "dark"
        ? "light"
        : theme === "light"
          ? "dark"
          : systemTheme === "dark"
            ? "light"
            : "dark";
    setTheme(nextTheme);
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;
      // Skip when focus sits on any interactive control so "d" never fires
      // right after clicking a button.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("button, a, [role='button'], [role='menuitem'], [role='option']")
      ) {
        return;
      }
      if (event.key.toLowerCase() !== "d") return;

      setThemeOnKeydown();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== storageKey) return;
      setTheme(isTheme(event.newValue) ? event.newValue : defaultTheme);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [defaultTheme, storageKey]);

  return <>{children}</>;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);
  return { theme, setTheme };
}
