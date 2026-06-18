import React, { type ReactNode } from 'react';
import { useDarkMode } from '../hooks/useDarkMode';

interface PublicEditorialShellProps {
  children: ReactNode;
}

const PublicEditorialShell: React.FC<PublicEditorialShellProps> = ({ children }) => {
  const { isDarkMode } = useDarkMode();

  return (
    <div
      className={`min-h-[100dvh] overflow-x-hidden ${isDarkMode ? 'dark' : ''}`}
      style={{
        backgroundColor: isDarkMode ? '#080808' : '#ffffff',
        color: isDarkMode ? '#f5f5f5' : '#080808',
        fontFamily: "'Inter', 'Arial', sans-serif",
      }}
      >
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
};

export default PublicEditorialShell;
