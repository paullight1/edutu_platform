import { useTheme } from "./useTheme";

export const useDarkMode = () => {
  useTheme();
  return { isDarkMode: false, toggleDarkMode: () => {} };
};
