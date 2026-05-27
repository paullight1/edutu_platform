/**
 * SplashScreen
 * A beautiful welcome screen shown when users first enter the app (after landing page).
 * Features the Edutu branding and a welcoming animation.
 */

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

interface SplashScreenProps {
    onComplete: () => void;
    userName?: string;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete, userName }) => {
    const { isDarkMode } = useDarkMode();
    const [phase, setPhase] = useState<'logo' | 'welcome' | 'complete'>('logo');

    useEffect(() => {
        // Phase 1: Logo animation (1s)
        const timer1 = setTimeout(() => setPhase('welcome'), 1000);

        // Phase 2: Welcome message (2s)
        const timer2 = setTimeout(() => setPhase('complete'), 2500);

        // Phase 3: Complete and transition (3s total)
        const timer3 = setTimeout(() => onComplete(), 3000);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
        };
    }, [onComplete]);

    return (
        <div
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-500 ${isDarkMode ? 'bg-gray-950' : 'bg-white'
                } ${phase === 'complete' ? 'opacity-0' : 'opacity-100'}`}
        >
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-accent-500/10" />

            {/* Animated circles */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />
            </div>

            {/* Logo Section */}
            <div
                className={`relative z-10 flex flex-col items-center transition-all duration-700 ${phase === 'logo' ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                    }`}
            >
                <div className="relative">
                    <div className="h-24 w-24 flex items-center justify-center rounded-3xl bg-gradient-to-tr from-brand-600 to-accent-500 shadow-2xl shadow-brand-500/30">
                        <img
                            src="/edutu-logo.png"
                            alt="Edutu Logo"
                            className="h-16 w-16 object-contain"
                        />
                    </div>
                    <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-white dark:bg-gray-900 rounded-full flex items-center justify-center shadow-lg">
                        <Sparkles size={16} className="text-brand-500" />
                    </div>
                </div>
            </div>

            {/* Welcome Message */}
            <div
                className={`absolute z-10 flex flex-col items-center text-center px-8 transition-all duration-700 ${phase === 'welcome' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`}
            >
                <h1 className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent mb-4">
                    Welcome to Edutu
                </h1>
                {userName && (
                    <p className="text-xl text-gray-600 dark:text-gray-400 font-medium">
                        Hello, {userName.split(' ')[0]}! 👋
                    </p>
                )}
                <p className="text-gray-500 dark:text-gray-500 mt-2">
                    Your personalized opportunity engine
                </p>
            </div>

            {/* Loading indicator */}
            <div className="absolute bottom-12 flex gap-1.5">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-2 w-2 rounded-full bg-brand-500 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                    />
                ))}
            </div>
        </div>
    );
};

export default SplashScreen;
