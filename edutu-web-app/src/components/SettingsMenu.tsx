import React from 'react';
import { User, Bell, Shield, HelpCircle, LogOut, MoreHorizontal, Moon, Sun, RefreshCw, Sparkles, Globe } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import PageHeader from './PageHeader';
import { useTheme } from '../hooks/useTheme';
import { Screen } from '../App';
import type { OnboardingProfileData } from '../types/onboarding';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './ui/LanguageSelector';

interface SettingsMenuProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  onRedoOnboarding?: () => void;
  onboardingProfile?: OnboardingProfileData | null;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ onBack, onNavigate, onLogout, onRedoOnboarding, onboardingProfile }) => {
  const { isDarkMode, toggleDarkMode, lightTheme, darkTheme, updateTheme, resetTheme } = useTheme();
  const [activeTab, setActiveTab] = React.useState<'main' | 'theme' | 'language'>('main');
  const { t } = useTranslation();

  const themePackages = [
    {
      id: 'default',
      name: 'Default Indigo',
      light: { accent: '99 102 241', background: '248 250 252' },
      dark: { accent: '99 102 241', background: '12 15 26' },
      color: '#6366f1'
    },
    {
      id: 'ocean',
      name: 'Ocean Breeze',
      light: { accent: '14 165 233', background: '240 253 244' },
      dark: { accent: '14 165 233', background: '2 6 23' },
      color: '#0ea5e9'
    },
    {
      id: 'sunset',
      name: 'African Sunset',
      light: { accent: '245 158 11', background: '255 253 245' },
      dark: { accent: '244 63 94', background: '15 12 26' },
      color: '#f59e0b'
    },
    {
      id: 'forest',
      name: 'Emerald Forest',
      light: { accent: '16 185 129', background: '248 250 252' },
      dark: { accent: '16 185 129', background: '2 6 23' },
      color: '#10b981'
    },
    {
      id: 'royal',
      name: 'Royal Velvet',
      light: { accent: '139 92 246', background: '255 241 242' },
      dark: { accent: '139 92 246', background: '15 12 26' },
      color: '#8b5cf6'
    }
  ];

  const applyPackage = (pkg: typeof themePackages[0]) => {
    updateTheme('light', pkg.light);
    updateTheme('dark', pkg.dark);
  };

  const settingsOptions = [
    {
      id: 'profile-edit' as Screen,
      title: t('settings.sections.profile'),
      description: 'Update your personal information and preferences',
      icon: <User size={20} className="text-primary" />,
      color: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
    },
    {
      id: 'notifications' as Screen,
      title: t('settings.sections.notifications'),
      description: 'Manage your notification preferences',
      icon: <Bell size={20} className="text-yellow-600" />,
      color: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
    },
    {
      id: 'privacy' as Screen,
      title: t('settings.sections.privacy'),
      description: 'Control your privacy settings and account security',
      icon: <Shield size={20} className="text-green-600" />,
      color: 'hover:bg-green-50 dark:hover:bg-green-900/20'
    },
    {
      id: 'help' as Screen,
      title: 'Help & Support',
      description: 'Get help and contact support',
      icon: <HelpCircle size={20} className="text-purple-600" />,
      color: 'hover:bg-purple-50 dark:hover:bg-purple-900/20'
    }
  ];

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (activeTab === 'theme' || activeTab === 'language') {
      setActiveTab('main');
    } else {
      scrollToTop();
      onBack();
    }
  };

  const handleNavigate = (screen: Screen) => {
    scrollToTop();
    onNavigate(screen);
  };

  const handleLogout = () => {
    scrollToTop();
    onLogout();
  };

  const handleRedoOnboarding = () => {
    if (!onRedoOnboarding) {
      return;
    }
    scrollToTop();
    onRedoOnboarding();
  };

  const hasProfileSnapshot = Boolean(onboardingProfile);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <PageHeader
        title={activeTab === 'theme' ? t('settings.sections.appearance') : activeTab === 'language' ? t('settings.sections.language') : t('navigation.more')}
        subtitle={activeTab === 'theme' ? 'Personalize your visual experience' : activeTab === 'language' ? 'Choose your preferred language' : 'Account, settings, and preferences'}
        onBack={handleBack}
        rightContent={activeTab === 'main' ? <MoreHorizontal size={24} className="text-primary" /> : undefined}
      />

      <div className="p-4 space-y-4 pb-24 max-w-2xl mx-auto">
        {activeTab === 'main' ? (
          <>
            {/* Theme Entry Point - Highlighted */}
            <Card
              className="cursor-pointer transition-all border-brand-500/20 bg-brand-50/30 dark:bg-brand-900/10 hover:border-brand-500/50 transform hover:scale-[1.02] animate-fade-in"
              onClick={() => setActiveTab('theme')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-500/10 dark:bg-brand-500/20 rounded-2xl flex items-center justify-center text-brand-500">
                  <Sparkles size={22} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 dark:text-white">Themes & Customization</h3>
                  <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">Change how Edutu looks and feels</p>
                </div>
                <div className="text-brand-400">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </Card>

            {/* Language Selector Entry */}
            <Card
              className="cursor-pointer transition-all hover:bg-sky-50 dark:hover:bg-sky-900/20 dark:bg-gray-800 dark:border-gray-700 transform hover:scale-[1.02] animate-fade-in"
              onClick={() => setActiveTab('language')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 rounded-2xl flex items-center justify-center">
                  <Globe size={20} className="text-sky-600 dark:text-sky-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 dark:text-white">{t('settings.sections.language')}</h3>
                  <p className="text-sm text-sky-600 dark:text-sky-400 font-medium">Choose your preferred language</p>
                </div>
                <div className="text-gray-400">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </Card>

            {/* Existing Options */}
            {settingsOptions.map((option, index) => (
              <Card
                key={option.id}
                className={`cursor-pointer transition-all transform hover:scale-[1.02] ${option.color} dark:bg-gray-800 dark:border-gray-700 animate-slide-up`}
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => handleNavigate(option.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 dark:text-white mb-1">{option.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{option.description}</p>
                  </div>
                  <div className="text-gray-400 dark:text-gray-500">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </Card>
            ))}

            {onRedoOnboarding && (
              <Card
                className="cursor-pointer transition-all transform hover:scale-[1.02] hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:bg-gray-800 dark:border-gray-700 animate-slide-up"
                style={{ animationDelay: '400ms' }}
                onClick={handleRedoOnboarding}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
                    <RefreshCw size={20} className="text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 dark:text-white mb-1">Personalization profile</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {hasProfileSnapshot
                        ? `Tailored for ${onboardingProfile?.courseOfStudy || 'your current path'}.`
                        : 'Share your goals and interests to tailor your experience.'}
                    </p>
                  </div>
                  <div className="mt-1 text-gray-400 dark:text-gray-500">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </Card>
            )}

            {/* Sign Out */}
            <Card
              className="cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border-red-200 dark:border-red-800 dark:bg-gray-800 animate-slide-up"
              style={{ animationDelay: '500ms' }}
              onClick={handleLogout}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center">
                  <LogOut size={20} className="text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-800 dark:text-red-400 mb-1">Sign Out</h3>
                  <p className="text-sm text-red-600 dark:text-red-500">Log out of your account</p>
                </div>
              </div>
            </Card>

            {/* App Info */}
            <div className="text-center text-gray-500 dark:text-gray-400 text-[10px] font-bold tracking-widest pt-8">
              Edutu v1.2 • African Youth Empowerment
            </div>
          </>
        ) : (
          <div className="animate-fade-in space-y-6">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                    {isDarkMode ? <Moon size={20} className="text-indigo-400" /> : <Sun size={20} className="text-amber-500" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">Dark Mode</h3>
                    <p className="text-xs text-gray-500">{isDarkMode ? 'Night owl browsing' : 'Bright and clear'}</p>
                  </div>
                </div>
                <button
                  onClick={toggleDarkMode}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${isDarkMode ? 'bg-primary' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </Card>

            <div className="space-y-4">
              <h4 className="text-[10px] font-black tracking-widest text-slate-400 ml-1">Theme Packages</h4>
              <div className="grid grid-cols-1 gap-3">
                {themePackages.map((pkg) => {
                  const isActive = (isDarkMode ? darkTheme.accent : lightTheme.accent) === pkg.dark.accent &&
                    (isDarkMode ? darkTheme.background : lightTheme.background) === (isDarkMode ? pkg.dark.background : pkg.light.background);
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => applyPackage(pkg)}
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isActive
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-subtle bg-white dark:bg-gray-800 hover:border-primary/30'
                        }`}
                    >
                      <div className="w-10 h-10 rounded-xl shadow-inner flex items-center justify-center" style={{ backgroundColor: pkg.color }}>
                        <div className="w-4 h-4 rounded-full bg-white/30" />
                      </div>
                      <div className="flex-1 text-left">
                        <h5 className="font-bold text-gray-800 dark:text-white">{pkg.name}</h5>
                      </div>
                      {isActive && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6 pt-4 border-t border-subtle">
              <h4 className="text-[10px] font-black tracking-widest text-slate-400 ml-1">Create Your Custom Theme</h4>

              <div className="space-y-5">
                <div>
                  <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3">Accent Color</h5>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { name: 'Indigo', value: '99 102 241', color: '#6366f1' },
                      { name: 'Rose', value: '244 63 94', color: '#f43f5e' },
                      { name: 'Emerald', value: '16 185 129', color: '#10b981' },
                      { name: 'Amber', value: '245 158 11', color: '#f59e0b' },
                      { name: 'Sky', value: '14 165 233', color: '#0ea5e9' },
                      { name: 'Violet', value: '139 92 246', color: '#8b5cf6' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => updateTheme(isDarkMode ? 'dark' : 'light', { accent: preset.value })}
                        className={`w-10 h-10 rounded-2xl transition-all transform hover:scale-110 shadow-sm border-2 ${(isDarkMode ? darkTheme.accent : lightTheme.accent) === preset.value
                          ? 'border-gray-900 dark:border-white ring-2 ring-primary/20 scale-110'
                          : 'border-transparent opacity-80'
                          }`}
                        style={{ backgroundColor: preset.color }}
                        title={preset.name}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3">Canvas Background</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(isDarkMode ? [
                      { name: 'Midnight', value: '12 15 26', color: '#0c0f1a' },
                      { name: 'Abyss', value: '2 6 23', color: '#020617' },
                      { name: 'Velvet', value: '15 12 26', color: '#0f0c1a' },
                      { name: 'Onyx', value: '23 23 23', color: '#171717' },
                    ] : [
                      { name: 'Snow', value: '248 250 252', color: '#f8fafc' },
                      { name: 'Silk', value: '255 253 245', color: '#fffdf5' },
                      { name: 'Blush', value: '255 241 242', color: '#fff1f2' },
                      { name: 'Mint', value: '240 253 244', color: '#f0fdf4' },
                    ]).map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => updateTheme(isDarkMode ? 'dark' : 'light', { background: preset.value })}
                        className={`py-3 px-2 rounded-xl border-2 transition-all font-bold text-[10px] tracking-wider ${(isDarkMode ? darkTheme.background : lightTheme.background) === preset.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-subtle bg-slate-50 dark:bg-white/5 text-slate-500'
                          }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  <Button
                    variant="secondary"
                    onClick={resetTheme}
                    className="w-full rounded-2xl py-4 h-auto font-black text-xs tracking-widest opacity-60 hover:opacity-100 transition-opacity border-dashed"
                  >
                    <RefreshCw size={16} className="mr-2" />
                    Reset to Factory Default
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Language Tab */}
        {activeTab === 'language' && (
          <div className="animate-fade-in space-y-6">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <LanguageSelector variant="list" />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsMenu;
