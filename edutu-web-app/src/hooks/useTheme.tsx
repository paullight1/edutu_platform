import { useState, useEffect, createContext, useContext } from "react";

interface ThemeColors {
  accent: string;
  background: string;
}

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
  lightTheme: ThemeColors;
  darkTheme: ThemeColors;
  updateTheme: (mode: "light" | "dark", updates: Partial<ThemeColors>) => void;
  resetTheme: () => void;
}

const THEME_STORAGE_KEY = "edutu-theme";
type ThemePreference = "light" | "dark" | null;

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

const readStoredPreference = (): ThemePreference => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return null;
  } catch (error) {
    console.warn("Failed to read theme preference.", error);
    return null;
  }
};

const writeStoredPreference = (value: ThemePreference): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (value === null) {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    }
  } catch (error) {
    console.warn("Failed to persist theme preference.", error);
  }
};

const darken = (rgb: string, factor = 0.88): string =>
  rgb
    .trim()
    .split(/\s+/)
    .map((channel) => Math.round(Number(channel) * factor))
    .join(" ");

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
  const [preference, setPreference] = useState<ThemePreference>(
    readStoredPreference,
  );
  const [systemPrefersDarkMode, setSystemPrefersDarkMode] =
    useState<boolean>(systemPrefersDark);

  const [lightTheme, setLightTheme] = useState<ThemeColors>(() =>
    readStoredColors("lightTheme", defaultLightTheme),
  );
  const [darkTheme, setDarkTheme] = useState<ThemeColors>(() =>
    readStoredColors("darkTheme", defaultDarkTheme),
  );

  // Dark mode has been removed from the product. This is forced to false so
  // every `isDarkMode ? dark : light` branch resolves to light, the `.dark`
  // class is never applied to <html>, and light theme CSS variables are used.
  const isDarkMode = false;

  // Reflect the active mode on <html> via the `.dark` class.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  // Follow the OS color-scheme query only while no explicit choice exists.
  useEffect(() => {
    if (preference !== null) {
      return;
    }
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
  }, [preference]);

  // Persist the explicit preference (null means "follow system").
  useEffect(() => {
    writeStoredPreference(preference);
  }, [preference]);

  // Persist user-customized accent/background palettes.
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

  // Apply accent customization only when a non-default accent is chosen.
  // brand-500 and brand-600 are kept distinct so the gradient ramp survives.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    const active = isDarkMode ? darkTheme : lightTheme;
    const defaults = isDarkMode ? defaultDarkTheme : defaultLightTheme;

    if (active.accent !== defaults.accent) {
      root.style.setProperty("--color-brand-500", active.accent);
      root.style.setProperty("--color-brand-600", darken(active.accent));
    } else {
      root.style.removeProperty("--color-brand-500");
      root.style.removeProperty("--color-brand-600");
    }

    if (active.background !== defaults.background) {
      root.style.setProperty("--surface-body", active.background);
    } else {
      root.style.removeProperty("--surface-body");
    }
  }, [isDarkMode, lightTheme, darkTheme]);

  const toggleDarkMode = () => {
    setPreference(isDarkMode ? "light" : "dark");
  };

  const setDarkMode = (value: boolean) => {
    setPreference(value ? "dark" : "light");
  };

  const updateTheme = (
    mode: "light" | "dark",
    updates: Partial<ThemeColors>,
  ) => {
    if (mode === "light") {
      setLightTheme((prev) => ({ ...prev, ...updates }));
    } else {
      setDarkTheme((prev) => ({ ...prev, ...updates }));
    }
  };

  const resetTheme = () => {
    setLightTheme(defaultLightTheme);
    setDarkTheme(defaultDarkTheme);
    setPreference(null);
  };

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        toggleDarkMode,
        setDarkMode,
        lightTheme,
        darkTheme,
        updateTheme,
        resetTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
