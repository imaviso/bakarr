/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, createContext, useContext } from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES = new Set<string>(["dark", "light", "system"]);

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false;
  }
  return THEME_VALUES.has(value);
}

function getSystemThemeSnapshot() {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
}

function subscribeSystemTheme(callback: () => void) {
  const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    () => "light",
  );
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
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

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey);
    if (isTheme(storedTheme)) {
      return storedTheme;
    }
    return defaultTheme;
  });

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme);
      setThemeState(nextTheme);
    },
    [storageKey],
  );

  const systemTheme = useSystemTheme();
  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  const applyTheme = useCallback(
    (nextResolvedTheme: ResolvedTheme) => {
      const root = document.documentElement;
      const restoreTransitions = disableTransitionOnChange ? disableTransitionsTemporarily() : null;

      root.classList.remove("light", "dark");
      root.classList.add(nextResolvedTheme);
      root.style.colorScheme = nextResolvedTheme;

      if (restoreTransitions) {
        restoreTransitions();
      }
    },
    [disableTransitionOnChange],
  );

  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme, applyTheme]);

  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== "d") return;

      const current = themeRef.current;
      const nextTheme: Theme =
        current === "dark"
          ? "light"
          : current === "light"
            ? "dark"
            : systemTheme === "dark"
              ? "light"
              : "dark";
      setTheme(nextTheme);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setTheme, systemTheme]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== storageKey) return;
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [defaultTheme, storageKey]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
