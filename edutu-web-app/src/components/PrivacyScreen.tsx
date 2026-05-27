import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Shield, Eye, Lock, Globe, Users, Database, Trash2, CheckCircle2, X } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import userSettingsService, {
  type PrivacySettings,
  type SecuritySettings,
} from '../services/userSettings';

interface PrivacyScreenProps {
  onBack: () => void;
}

const PRIVACY_DEFAULTS: PrivacySettings = {
  profileVisibility: 'public',
  dataSharing: false,
  analyticsTracking: true,
  personalizedAds: false,
  activityStatus: true,
  searchVisibility: true
};

const SECURITY_DEFAULTS: SecuritySettings = {
  twoFactorEnabled: false,
  lastPasswordUpdate: null,
  lastDataDownload: null
};

type ActiveModal = 'password' | 'twoFactor' | 'delete' | null;

const PrivacyScreen: React.FC<PrivacyScreenProps> = ({ onBack }) => {
  const { isDarkMode } = useDarkMode();
  const { userId } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(PRIVACY_DEFAULTS);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(SECURITY_DEFAULTS);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Load settings from Supabase on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await userSettingsService.getUserSettings();
        if (settings) {
          setPrivacySettings(settings.privacy);
          setSecuritySettings(settings.security);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const showMessage = (message: string) => {
    setActionMessage(message);
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleToggle = async (key: keyof PrivacySettings) => {
    const newValue = !privacySettings[key];
    setPrivacySettings((prev) => ({
      ...prev,
      [key]: newValue
    }));

    setIsSaving(true);
    const result = await userSettingsService.savePrivacySettings({ [key]: newValue });
    setIsSaving(false);

    if (result.success) {
      showMessage('Privacy settings updated.');
    } else {
      // Revert on failure
      setPrivacySettings((prev) => ({ ...prev, [key]: !newValue }));
      showMessage(result.error || 'Failed to save settings.');
    }
  };

  const handleVisibilityChange = async (value: PrivacySettings['profileVisibility']) => {
    const previousValue = privacySettings.profileVisibility;
    setPrivacySettings((prev) => ({
      ...prev,
      profileVisibility: value
    }));

    setIsSaving(true);
    const result = await userSettingsService.savePrivacySettings({ profileVisibility: value });
    setIsSaving(false);

    if (result.success) {
      showMessage(`Profile visibility set to ${value}.`);
    } else {
      setPrivacySettings((prev) => ({ ...prev, profileVisibility: previousValue }));
      showMessage(result.error || 'Failed to save settings.');
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    scrollToTop();
    onBack();
  };

  const handleDownloadData = async () => {
    setIsSaving(true);
    const result = await userSettingsService.exportUserData();
    setIsSaving(false);

    if (result.success && result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'edutu-data-export.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setSecuritySettings((prev) => ({
        ...prev,
        lastDataDownload: new Date().toISOString()
      }));
      showMessage('A copy of your data has been downloaded.');
    } else {
      showMessage(result.error || 'Failed to export data.');
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordForm.next || passwordForm.next.length < 8) {
      showMessage('Password must be at least 8 characters.');
      return;
    }

    if (passwordForm.next !== passwordForm.confirm) {
      showMessage('New passwords do not match.');
      return;
    }

    setIsSaving(true);
    const result = await userSettingsService.changePassword(userId || '', passwordForm.current, passwordForm.next);
    setIsSaving(false);

    if (result.success) {
      setSecuritySettings((prev) => ({
        ...prev,
        lastPasswordUpdate: new Date().toISOString()
      }));
      setPasswordForm({ current: '', next: '', confirm: '' });
      setActiveModal(null);
      showMessage('Password updated successfully.');
    } else {
      showMessage(result.error || 'Failed to update password.');
    }
  };

  const handleTwoFactorToggle = async () => {
    const newValue = !securitySettings.twoFactorEnabled;

    setIsSaving(true);
    const result = await userSettingsService.toggleTwoFactor(newValue);
    setIsSaving(false);

    if (result.success) {
      setSecuritySettings((prev) => ({
        ...prev,
        twoFactorEnabled: newValue
      }));
      showMessage(
        newValue
          ? 'Two-factor authentication enabled.'
          : 'Two-factor authentication disabled.'
      );
      setActiveModal(null);
    } else {
      showMessage(result.error || 'Failed to update 2FA settings.');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      showMessage('Please type DELETE to confirm.');
      return;
    }

    setIsSaving(true);
    const result = await userSettingsService.requestAccountDeletion();
    setIsSaving(false);

    if (result.success) {
      setDeleteConfirmation('');
      setActiveModal(null);
      showMessage('Account deletion request submitted. We will contact you shortly.');
    }
  };

  const privacyOptions = useMemo(
    () => [
      {
        id: 'dataSharing',
        title: 'Data Sharing',
        description: 'Share anonymized data to improve our services',
        icon: <Database size={20} className="text-blue-600" />,
        enabled: privacySettings.dataSharing
      },
      {
        id: 'analyticsTracking',
        title: 'Analytics Tracking',
        description: 'Help us understand how you use the app',
        icon: <Globe size={20} className="text-green-600" />,
        enabled: privacySettings.analyticsTracking
      },
      {
        id: 'personalizedAds',
        title: 'Personalized Ads',
        description: 'Show ads based on your interests',
        icon: <Eye size={20} className="text-purple-600" />,
        enabled: privacySettings.personalizedAds
      },
      {
        id: 'activityStatus',
        title: 'Activity Status',
        description: 'Show when you were last active',
        icon: <Users size={20} className="text-yellow-600" />,
        enabled: privacySettings.activityStatus
      },
      {
        id: 'searchVisibility',
        title: 'Search Visibility',
        description: 'Allow others to find you in search',
        icon: <Eye size={20} className="text-red-600" />,
        enabled: privacySettings.searchVisibility
      }
    ],
    [privacySettings]
  );

  const renderModal = () => {
    if (!activeModal) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              {activeModal === 'password' && 'Change Password'}
              {activeModal === 'twoFactor' && 'Two-Factor Authentication'}
              {activeModal === 'delete' && 'Delete Account'}
            </h3>
            <button
              onClick={() => setActiveModal(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {activeModal === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.current}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, current: event.target.value }))}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter current password"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.next}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, next: event.target.value }))}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm: event.target.value }))}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Repeat new password"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Update Password
              </Button>
              {securitySettings.lastPasswordUpdate && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Last changed on {new Date(securitySettings.lastPasswordUpdate).toLocaleDateString()}
                </p>
              )}
            </form>
          )}

          {activeModal === 'twoFactor' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Add an extra layer of protection to your account. We&apos;ll send a verification code to your email each time you sign in.
              </p>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-600">
                <Shield size={24} className="text-primary" />
                <div>
                  <div className="font-semibold text-gray-800 dark:text-white">
                    {securitySettings.twoFactorEnabled ? 'Two-factor is active' : 'Two-factor is off'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {securitySettings.twoFactorEnabled
                      ? 'Codes will be required on every new sign-in.'
                      : 'Enable this if you share devices or travel frequently.'}
                  </div>
                </div>
              </div>
              <Button onClick={handleTwoFactorToggle} className="w-full">
                {securitySettings.twoFactorEnabled ? 'Disable Two-Factor' : 'Enable Two-Factor'}
              </Button>
            </div>
          )}

          {activeModal === 'delete' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                This will permanently delete your account and all associated data within 14 days. This action cannot be undone.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type DELETE to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="DELETE"
                />
              </div>
              <Button
                onClick={handleDeleteAccount}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                Permanently Delete Account
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center ${isDarkMode ? 'dark' : ''}`}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading your privacy settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">Privacy &amp; Security</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isSaving ? 'Saving...' : 'Control your privacy settings'}
              </p>
            </div>
            <Shield size={24} className={`text-primary ${isSaving ? 'animate-pulse' : ''}`} />
          </div>
          {actionMessage && (
            <p className="mt-3 text-sm text-primary flex items-center gap-2">
              <CheckCircle2 size={16} />
              {actionMessage}
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Profile Visibility</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose who can see your profile information
          </p>
          <div className="space-y-3">
            {(['public', 'friends', 'private'] as const).map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-all"
              >
                <input
                  type="radio"
                  name="visibility"
                  value={option}
                  checked={privacySettings.profileVisibility === option}
                  onChange={() => handleVisibilityChange(option)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-800 dark:text-white capitalize">{option}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {option === 'public' && 'Anyone can see your profile'}
                    {option === 'friends' && 'Only your connections can see your profile'}
                    {option === 'private' && 'Only you can see your profile'}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Privacy Controls</h3>
          <div className="space-y-4">
            {privacyOptions.map((setting, index) => (
              <div
                key={setting.id}
                className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                    {setting.icon}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 dark:text-white">{setting.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{setting.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(setting.id as keyof PrivacySettings)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${setting.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  aria-pressed={setting.enabled}
                  aria-label={`Toggle ${setting.title}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${setting.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Security</h3>
          <div className="space-y-3">
            <button
              onClick={() => setActiveModal('password')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-left"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                <Lock size={20} className="text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-800 dark:text-white">Change Password</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Update your account password
                  {securitySettings.lastPasswordUpdate && (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Last updated {new Date(securitySettings.lastPasswordUpdate).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
            </button>

            <button
              onClick={() => setActiveModal('twoFactor')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-left"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                <Shield size={20} className="text-green-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-800 dark:text-white">Two-Factor Authentication</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {securitySettings.twoFactorEnabled ? '2FA is currently enabled' : 'Add an extra layer of security'}
                </p>
              </div>
            </button>
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Data Management</h3>
          <div className="space-y-3">
            <button
              onClick={handleDownloadData}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
            >
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                <Database size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-800 dark:text-white">Download My Data</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get a copy of your data
                  {securitySettings.lastDataDownload && (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Last downloaded {new Date(securitySettings.lastDataDownload).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
            </button>

            <button
              onClick={() => setActiveModal('delete')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-left"
            >
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-red-800 dark:text-red-400">Delete Account</h4>
                <p className="text-sm text-red-600 dark:text-red-500">Permanently delete your account</p>
              </div>
            </button>
          </div>
        </Card>
      </div>

      {renderModal()}
    </div>
  );
};

export default PrivacyScreen;

