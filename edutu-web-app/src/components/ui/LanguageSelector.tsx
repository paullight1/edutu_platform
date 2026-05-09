import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    changeLanguage,
    getCurrentLanguage,
    getAvailableLanguages,
    type SupportedLanguage,
} from '../../i18n';

interface LanguageSelectorProps {
    variant?: 'dropdown' | 'list';
    className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
    variant = 'dropdown',
    className = '',
}) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const currentLang = getCurrentLanguage();
    const languages = getAvailableLanguages();
    const currentLanguage = languages.find((l) => l.code === currentLang);

    const handleLanguageChange = (code: SupportedLanguage) => {
        changeLanguage(code);
        setIsOpen(false);
    };

    if (variant === 'list') {
        return (
            <div className={`space-y-2 ${className}`}>
                <h3 className="text-sm font-medium text-gray-400 mb-3">
                    {t('settings.language.select')}
                </h3>
                {languages.map((lang) => (
                    <button
                        key={lang.code}
                        onClick={() => handleLanguageChange(lang.code)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${currentLang === lang.code
                                ? 'bg-indigo-600/20 border border-indigo-500/30 text-white'
                                : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-lg">{getFlagEmoji(lang.code)}</span>
                            <div className="text-left">
                                <span className="font-medium">{lang.nativeName}</span>
                                {lang.code !== 'en' && (
                                    <span className="ml-2 text-sm text-gray-500">({lang.name})</span>
                                )}
                            </div>
                        </div>
                        {currentLang === lang.code && (
                            <Check className="w-5 h-5 text-indigo-400" />
                        )}
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <Globe className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium">{currentLanguage?.nativeName}</span>
                <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''
                        }`}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full mt-2 w-48 py-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-50"
                            role="listbox"
                        >
                            {languages.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => handleLanguageChange(lang.code)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${currentLang === lang.code
                                            ? 'bg-indigo-600/20 text-indigo-300'
                                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                        }`}
                                    role="option"
                                    aria-selected={currentLang === lang.code}
                                >
                                    <span>{getFlagEmoji(lang.code)}</span>
                                    <span className="flex-1 text-left">{lang.nativeName}</span>
                                    {currentLang === lang.code && (
                                        <Check className="w-4 h-4 text-indigo-400" />
                                    )}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

// Helper function to get flag emoji for language code
function getFlagEmoji(langCode: string): string {
    const flags: Record<string, string> = {
        en: '🇺🇸',
        es: '🇪🇸',
        fr: '🇫🇷',
        de: '🇩🇪',
        zh: '🇨🇳',
        ar: '🇸🇦',
    };
    return flags[langCode] || '🌐';
}

export default LanguageSelector;
