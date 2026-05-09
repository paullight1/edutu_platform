import { useState, useEffect, createContext, useContext } from 'react';

interface ThemeColors {
    accent: string;
    background: string;
}

interface ThemeContextType {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    lightTheme: ThemeColors;
    darkTheme: ThemeColors;
    updateTheme: (mode: 'light' | 'dark', updates: Partial<ThemeColors>) => void;
    resetTheme: () => void;
}

const defaultLightTheme: ThemeColors = {
    accent: '99 102 241', // Indigo 500
    background: '248 250 252', // Slate 50
};

const defaultDarkTheme: ThemeColors = {
    accent: '129 140 248', // Indigo 400
    background: '12 15 26', // Custom dark
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('darkMode');
            return saved ? JSON.parse(saved) : false;
        }
        return false;
    });

    const [lightTheme, setLightTheme] = useState<ThemeColors>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('lightTheme');
            return saved ? JSON.parse(saved) : defaultLightTheme;
        }
        return defaultLightTheme;
    });

    const [darkTheme, setDarkTheme] = useState<ThemeColors>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('darkTheme');
            return saved ? JSON.parse(saved) : defaultDarkTheme;
        }
        return defaultDarkTheme;
    });

    useEffect(() => {
        localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    useEffect(() => {
        localStorage.setItem('lightTheme', JSON.stringify(lightTheme));
        localStorage.setItem('darkTheme', JSON.stringify(darkTheme));

        const root = document.documentElement;

        // Apply light theme variables
        root.style.setProperty('--light-accent', lightTheme.accent);
        root.style.setProperty('--light-bg', lightTheme.background);

        // Apply dark theme variables
        root.style.setProperty('--dark-accent', darkTheme.accent);
        root.style.setProperty('--dark-bg', darkTheme.background);

        // Apply active variables based on current mode
        if (isDarkMode) {
            root.style.setProperty('--color-brand-500', darkTheme.accent);
            root.style.setProperty('--color-brand-600', darkTheme.accent);
            root.style.setProperty('--surface-body', darkTheme.background);
        } else {
            root.style.setProperty('--color-brand-500', lightTheme.accent);
            root.style.setProperty('--color-brand-600', lightTheme.accent);
            root.style.setProperty('--surface-body', lightTheme.background);
        }
    }, [lightTheme, darkTheme, isDarkMode]);

    const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

    const updateTheme = (mode: 'light' | 'dark', updates: Partial<ThemeColors>) => {
        if (mode === 'light') {
            setLightTheme(prev => ({ ...prev, ...updates }));
        } else {
            setDarkTheme(prev => ({ ...prev, ...updates }));
        }
    };

    const resetTheme = () => {
        setLightTheme(defaultLightTheme);
        setDarkTheme(defaultDarkTheme);
    };

    return (
        <ThemeContext.Provider value={{
            isDarkMode,
            toggleDarkMode,
            lightTheme,
            darkTheme,
            updateTheme,
            resetTheme
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
