import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Smartphone,
  Mail,
  Calendar,
  Award,
  Target,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { useNotifications } from '../hooks/useNotifications';
import type { NotificationPreferences } from '../services/notifications';

interface NotificationsScreenProps {
  onBack: () => void;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushNotifications: true,
  emailNotifications: false,
  opportunityAlerts: true,
  deadlineReminders: true,
  goalReminders: true,
  achievementCelebrations: true,
  weeklyDigest: false,
  marketingEmails: false,
  quietHours: { start: '22:00', end: '08:00' },
  updatedAt: new Date(0).toISOString()
};

const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ onBack }) => {
  const { isDarkMode } = useDarkMode();
  const {
    preferences,
    savePreferences,
    refreshPreferences,
    requestPushPermission,
    pushPermission,
    sendNotification
  } = useNotifications();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  const currentPreferences = useMemo(
    () => preferences ?? DEFAULT_PREFERENCES,
    [preferences]
  );

  const settingBlocks = useMemo(
    () => [
      {
        id: 'pushNotifications' as const,
        title: 'Push Notifications',
        description: 'Receive notifications on your device.',
        icon: <Smartphone size={20} className="text-primary" />,
        enabled: currentPreferences.pushNotifications
      },
      {
        id: 'emailNotifications' as const,
        title: 'Email Notifications',
        description: 'Get important updates in your inbox.',
        icon: <Mail size={20} className="text-blue-500" />,
        enabled: currentPreferences.emailNotifications
      },
      {
        id: 'opportunityAlerts' as const,
        title: 'Opportunity Alerts',
        description: 'Know when high-match opportunities drop.',
        icon: <Award size={20} className="text-amber-500" />,
        enabled: currentPreferences.opportunityAlerts
      },
      {
        id: 'deadlineReminders' as const,
        title: 'Deadline Reminders',
        description: 'Stay ahead of approaching application deadlines.',
        icon: <Calendar size={20} className="text-red-500" />,
        enabled: currentPreferences.deadlineReminders
      },
      {
        id: 'goalReminders' as const,
        title: 'Goal Reminders',
        description: 'Get nudges that keep your goals on track.',
        icon: <Target size={20} className="text-purple-500" />,
        enabled: currentPreferences.goalReminders
      },
      {
        id: 'achievementCelebrations' as const,
        title: 'Achievement Celebrations',
        description: 'Celebrate milestones with encouraging updates.',
        icon: <Award size={20} className="text-emerald-500" />,
        enabled: currentPreferences.achievementCelebrations
      }
    ],
    [currentPreferences]
  );

  const emailBlocks = useMemo(
    () => [
      {
        id: 'weeklyDigest' as const,
        title: 'Weekly Digest',
        description: 'Summary of recent progress and new opportunities.',
        enabled: currentPreferences.weeklyDigest
      },
      {
        id: 'marketingEmails' as const,
        title: 'Growth Updates',
        description: 'Occasional stories, community highlights, and product updates.',
        enabled: currentPreferences.marketingEmails
      }
    ],
    [currentPreferences]
  );

  const updatePreference = async (updates: Partial<NotificationPreferences>, message?: string) => {
    setWorking(true);
    try {
      await savePreferences(updates);
      setStatusMessage(message ?? 'Notification preferences updated.');
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (error) {
      console.error('Failed to update notification preferences', error);
      setStatusMessage('We could not update your preferences. Please try again.');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setWorking(false);
    }
  };

  const handleToggle = (key: keyof NotificationPreferences) => {
    const nextValue = !currentPreferences[key];
    void updatePreference({ [key]: nextValue } as Partial<NotificationPreferences>);
  };

  const handleQuietHoursChange = (key: 'start' | 'end', value: string) => {
    const quietHours = {
      ...currentPreferences.quietHours,
      [key]: value
    };
    void updatePreference({ quietHours }, 'Quiet hours updated.');
  };

  const handleBack = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onBack();
  };

  const handleTestNotification = async () => {
    if (!preferences) {
      await refreshPreferences();
    }

    setTestingNotification(true);
    try {
      await sendNotification({
        kind: 'system',
        title: 'Edutu notification test',
        body: 'This is a sample notification to confirm your delivery channels are working.',
        severity: 'info'
      });
      setStatusMessage('Test notification sent. Check your inbox.');
    } catch (error) {
      console.error('Failed to send test notification', error);
      setStatusMessage('Unable to send test notification. Please try again.');
    } finally {
      setTestingNotification(false);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const canSendTest =
    currentPreferences.pushNotifications ||
    currentPreferences.emailNotifications;

  if (!preferences) {
    return (
      <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
        <div className="flex items-center gap-3 px-4 py-4">
          <Button
            variant="secondary"
            onClick={handleBack}
            className="p-2 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white">Notification Settings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading your personal notification preferences...
            </p>
          </div>
        </div>
        <div className="p-4">
          <Card className="p-6 text-center dark:bg-gray-800 dark:border-gray-700">
            <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-300">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p>Fetching notification preferences…</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white pb-16 dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
        <Button
          variant="secondary"
          onClick={handleBack}
          className="p-2 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white">Notification Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Control how and when Edutu reaches out to you.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
        </div>
      )}

      <div className="space-y-6 p-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Push channel</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enable in-browser or mobile push notifications.
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={pushPermission === 'granted'}
              onClick={() => void requestPushPermission()}
            >
              {pushPermission === 'granted' ? 'Enabled' : 'Enable push'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Permission status: {pushPermission}
          </p>
        </Card>

        <Card className="space-y-4 dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Channels & alerts</h3>
          <div className="space-y-4">
            {settingBlocks.map((setting, index) => (
              <div
                key={setting.id}
                className="flex items-center justify-between rounded-2xl p-3 transition hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
                    {setting.icon}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 dark:text-white">{setting.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{setting.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(setting.id)}
                  disabled={working}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    setting.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'
                  } ${working ? 'opacity-60' : ''}`}
                  aria-pressed={setting.enabled}
                  aria-label={`Toggle ${setting.title}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      setting.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Email preferences</h3>
          <div className="space-y-3">
            {emailBlocks.map((setting, index) => (
              <div
                key={setting.id}
                className="flex items-center justify-between rounded-2xl p-3 transition hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-white">{setting.title}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{setting.description}</p>
                </div>
                <button
                  onClick={() => handleToggle(setting.id)}
                  disabled={working}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    setting.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'
                  } ${working ? 'opacity-60' : ''}`}
                  aria-pressed={setting.enabled}
                  aria-label={`Toggle ${setting.title}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      setting.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Quiet hours</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Mute non-critical updates during your downtime. Urgent alerts still reach you when necessary.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Start time</label>
              <input
                type="time"
                value={currentPreferences.quietHours.start}
                disabled={working}
                onChange={(event) => handleQuietHoursChange('start', event.target.value)}
                className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-primary focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">End time</label>
              <input
                type="time"
                value={currentPreferences.quietHours.end}
                disabled={working}
                onChange={(event) => handleQuietHoursChange('end', event.target.value)}
                className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-primary focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Quiet hours active from {currentPreferences.quietHours.start} to {currentPreferences.quietHours.end}.
          </p>
        </Card>

        <Card className="text-center dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Send test notification</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Verify that your current preferences deliver notifications as expected.
          </p>
          <Button
            className="mt-4 inline-flex items-center gap-2"
            onClick={() => void handleTestNotification()}
            disabled={!canSendTest || testingNotification}
          >
            {canSendTest ? <Bell size={16} /> : <BellOff size={16} />}
            {testingNotification ? 'Sending...' : 'Send test notification'}
          </Button>
          {!canSendTest && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Enable push or email notifications above to receive test alerts.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default NotificationsScreen;

