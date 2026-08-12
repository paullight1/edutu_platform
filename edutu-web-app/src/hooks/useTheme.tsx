import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from "react";

interface ThemeColors {
  accent: string;
  background: string;
}

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  // -- Light / dark ---------------------------------------------------------
  /** Resolved boolean: true when the dark palette is active right now. */
  isDarkMode: boolean;
  /** User's explicit choice: light, dark, or follow the OS ("system"). */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
  // -- Legacy accent customization (kept for backwards compatibility) -------
  lightTheme: ThemeColors;
  darkTheme: ThemeColors;
  updateTheme: (mode: "light" | "dark", updates: Partial<ThemeColors>) => void;
  resetTheme: () => void;
}

const MODE_STORAGE_KEY = "edutu-theme-mode";
const LEGACY_MODE_STORAGE_KEY = "edutu-theme";

const defaultLightTheme: ThemeColors = {
  accent: "99 102 241", // Indigo 500
  background: "248 250 252", // Slate 50
};

const defaultDarkTheme: ThemeColors = {
  accent: "129 140 248", // Indigo 400
  background: "12 15 26", // Custom dark
};

const systemPrefersDark = (): boolean => {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
};

const readStoredMode = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "system";
  }
  try {
    const stored =
      window.localStorage.getItem(MODE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_MODE_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  } catch (error) {
    console.warn("Failed to read theme mode.", error);
    return "system";
  }
};

const readStoredColors = (
  key: string,
  fallback: ThemeColors,
): ThemeColors => {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as ThemeColors) : fallback;
  } catch (error) {
    console.warn(`Failed to read stored colors for "${key}".`, error);
    return fallback;
  }
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemPrefersDarkMode, setSystemPrefersDarkMode] =
    useState<boolean>(systemPrefersDark);

  const [lightTheme, setLightTheme] = useState<ThemeColors>(() =>
    readStoredColors("lightTheme", defaultLightTheme),
  );
  const [darkTheme, setDarkTheme] = useState<ThemeColors>(() =>
    readStoredColors("darkTheme", defaultDarkTheme),
  );

  const isDarkMode =
    mode === "dark" || (mode === "system" && systemPrefersDarkMode);

  // Reflect the active mode on <html> via the `.dark` class (class strategy,
  // matched by tailwind darkMode:'class' and the index.css `.dark` tokens).
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  // Theme packs are intentionally not user-configurable. Remove the old
  // attribute so a previous version cannot change the product palette.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.removeAttribute("data-theme");
  }, []);

  // Keep the browser chrome (address bar / status bar) in step with the theme.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) return;
    meta.setAttribute("content", isDarkMode ? "#0c0f1a" : "#f8fafc");
  }, [isDarkMode]);

  // Follow the OS color-scheme query (always tracked; only *used* while the
  // mode is "system").
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemPrefersDarkMode(event.matches);
    setSystemPrefersDarkMode(mql.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  // Persist the explicit mode + pack choices.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
      // Keep the legacy key in step so an older bundle in another tab agrees.
      window.localStorage.setItem(LEGACY_MODE_STORAGE_KEY, mode);
    } catch (error) {
      console.warn("Failed to persist theme mode.", error);
    }
  }, [mode]);

  // Persist user-customized accent/background palettes (legacy feature).
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem("lightTheme", JSON.stringify(lightTheme));
      window.localStorage.setItem("darkTheme", JSON.stringify(darkTheme));
    } catch (error) {
      console.warn("Failed to persist theme colors.", error);
    }
  }, [lightTheme, darkTheme]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);

  const toggleDarkMode = useCallback(() => {
    setModeState((prev) => {
      const resolvedDark =
        prev === "dark" || (prev === "system" && systemPrefersDark());
      return resolvedDark ? "light" : "dark";
    });
  }, []);

  const setDarkMode = useCallback((value: boolean) => {
    setModeState(value ? "dark" : "light");
  }, []);

  const updateTheme = useCallback(
    (target: "light" | "dark", updates: Partial<ThemeColors>) => {
      if (target === "light") {
        setLightTheme((prev) => ({ ...prev, ...updates }));
      } else {
        setDarkTheme((prev) => ({ ...prev, ...updates }));
      }
    },
    [],
  );

  const resetTheme = useCallback(() => {
    setLightTheme(defaultLightTheme);
    setDarkTheme(defaultDarkTheme);
    setModeState("system");
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({
      isDarkMode,
      mode,
      setMode,
      toggleDarkMode,
      setDarkMode,
      lightTheme,
      darkTheme,
      updateTheme,
      resetTheme,
    }),
    [
      isDarkMode,
      mode,
      setMode,
      toggleDarkMode,
      setDarkMode,
      lightTheme,
      darkTheme,
      updateTheme,
      resetTheme,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
