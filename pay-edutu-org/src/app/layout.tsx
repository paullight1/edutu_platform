import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Edutu Pay — Secure checkout',
  description: 'Securely upgrade to Edutu Pro.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
