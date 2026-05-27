import React from 'react';

const PlaceholderPage: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="flex flex-col items-center justify-center h-96">
    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mb-4">
      <span className="text-2xl">🚧</span>
    </div>
    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h2>
    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
  </div>
);

export const OpportunitiesPage = () => (
  <PlaceholderPage title="Opportunities Management" description="Manage and moderate platform opportunities. Coming soon." />
);

export const AnalyticsPage = () => (
  <PlaceholderPage title="Analytics Dashboard" description="Detailed platform analytics and insights. Coming soon." />
);

export const SettingsPage = () => (
  <PlaceholderPage title="Admin Settings" description="Configure platform settings and preferences. Coming soon." />
);
