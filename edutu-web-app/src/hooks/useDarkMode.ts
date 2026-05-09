import { useTheme } from './useTheme';

export const useDarkMode = () => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  return { isDarkMode, toggleDarkMode };
};
