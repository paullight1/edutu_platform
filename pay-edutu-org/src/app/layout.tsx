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
  // The real Edutu logo (same asset the mobile app ships) — replaces the old
  // placeholder "E" glyph so checkout is instantly recognisable as Edutu.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="brand-mark"
      src="/edutu-logo.png"
      alt=""
      width={34}
      height={34}
      style={{ borderRadius: 10, objectFit: 'contain' }}
      aria-hidden="true"
    />
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
