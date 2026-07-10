import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Edutu Pay — Secure checkout',
  description: 'Securely upgrade to Edutu Pro.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#05070f' },
    { media: '(prefers-color-scheme: light)', color: '#eef0f8' },
  ],
};

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="edutu-g" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="10" fill="url(#edutu-g)" />
      {/* stylised “E” — three strokes, ascending like a path of opportunity */}
      <path
        d="M11 11.5h12M11 17h8.5M11 22.5h12"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
          <header className="site-head">
            <span className="brand">
              <BrandMark />
              <span>
                <span className="brand-name">Edutu Pay</span>
                <span className="brand-sub">Secure checkout</span>
              </span>
            </span>
            <span className="secure-chip">
              <LockIcon />
              <span>256-bit encrypted</span>
            </span>
          </header>
          {children}
          <footer className="site-foot">
            <span className="trust">
              <LockIcon />
              <span>
                Payments secured by <strong>Paystack</strong>
              </span>
            </span>
            <span className="fine">© {new Date().getFullYear()} Edutu · support@edutu.org</span>
          </footer>
        </main>
      </body>
    </html>
  );
}
