import React, { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicSiteMenu from './PublicSiteMenu';

interface PublicEditorialShellProps {
  children: ReactNode;
}

const linkGroups = [
  {
    title: 'Product',
    links: [
      { label: 'Opportunities', to: '/opportunities' },
      { label: 'Mentor', to: '/mentor' },
      { label: 'Download', to: '/download' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', to: '/blog' },
      { label: 'Developer Docs', to: '/docs' },
      { label: 'Scholarship API', to: '/scholarship-api' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Privacy', to: '/about' },
      { label: 'Terms', to: '/about' },
    ],
  },
];

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
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b backdrop-blur-md transition-colors duration-300"
        style={{
          backgroundColor: isDarkMode ? 'rgba(8, 8, 8, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderBottomColor: isDarkMode ? '#222' : '#d8d8d8',
        }}
      >
        <div className="mx-auto flex h-[64px] max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2" style={{ textDecoration: 'none' }}>
            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
              edutu
            </span>
          </Link>

          <PublicSiteMenu />
        </div>
      </header>

      <main className="pt-[92px]">{children}</main>

      <footer
        className="border-t px-4 py-10 sm:px-6 sm:py-14"
        style={{ borderTopColor: isDarkMode ? '#222' : '#d8d8d8' }}
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-12">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                <span className="text-xl font-bold tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                  edutu
                </span>
              </div>
              <p className="max-w-sm text-sm leading-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                Find scholarships, jobs, and global opportunities, then move from discovery to application with less friction.
              </p>
            </div>

            {linkGroups.map((group) => (
              <div key={group.title}>
                <h4
                  className="mb-3 text-[11px] font-bold uppercase tracking-[0.3em]"
                  style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                >
                  {group.title}
                </h4>
                <div className="space-y-2">
                  {group.links.map((link) => (
                    <Link
                      key={link.label}
                      to={link.to}
                      className="block text-sm transition-colors hover:text-brand-500"
                      style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-8 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderTopColor: isDarkMode ? '#222' : '#d8d8d8' }}
          >
            <span className="text-xs" style={{ color: isDarkMode ? '#777' : '#8a8a8a' }}>
              © {new Date().getFullYear()} Edutu Inc. All rights reserved.
            </span>
            <p className="text-xs" style={{ color: isDarkMode ? '#777' : '#8a8a8a' }}>
              Public article pages keep the same editorial header and footer for a consistent reading experience.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicEditorialShell;
