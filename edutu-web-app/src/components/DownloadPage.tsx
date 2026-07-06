import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Download, Globe, Smartphone } from 'lucide-react';
import PublicEditorialShell from './PublicEditorialShell';

const installWays = [
  {
    title: 'Android',
    subtitle: 'Install from the browser menu',
    icon: Smartphone,
    tintClass: 'bg-brand/10',
    accentClass: 'text-brand',
    steps: ['Open Edutu in Chrome', 'Use the browser menu', 'Choose Install app or Add to Home screen'],
  },
  {
    title: 'iPhone',
    subtitle: 'Save Edutu to your Home Screen',
    icon: Globe,
    tintClass: 'bg-accent/10',
    accentClass: 'text-accent',
    steps: ['Open Edutu in Safari', 'Tap Share', 'Choose Add to Home Screen'],
  },
  {
    title: 'Desktop',
    subtitle: 'Use Edutu like a native app',
    icon: Download,
    tintClass: 'bg-success/10',
    accentClass: 'text-success',
    steps: ['Open the site in Chrome or Edge', 'Install from the address bar', 'Sign in to keep everything synced'],
  },
] as const satisfies Array<{
  title: string;
  subtitle: string;
  icon: React.ElementType;
  tintClass: string;
  accentClass: string;
  steps: readonly string[];
}>;

const DownloadPage: React.FC = () => {
  return (
    <PublicEditorialShell>
      <main className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <section className="space-y-6 border-b border-subtle pb-10 sm:pb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
              <Download size={14} />
              Download app
            </div>

            <div className="max-w-3xl space-y-4">
              <h1 className="font-display text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.06] tracking-tight text-text-primary">
                Install Edutu once.
                <span className="block text-brand">Use it anywhere.</span>
              </h1>

              <p className="max-w-2xl text-[15px] leading-[1.7] text-text-secondary sm:text-[16px]">
                Keep saved opportunities, deadlines, and progress within reach on mobile or desktop. Edutu works in your browser and can be added to your home screen in a few steps.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white no-underline shadow-elevated transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
              >
                Open Edutu
              </Link>
              <Link
                to="/opportunities"
                className="inline-flex items-center justify-center rounded-full border border-strong bg-surface-layer px-6 py-3 text-sm font-semibold text-text-primary no-underline transition-colors hover:border-brand/50"
              >
                Browse opportunities
              </Link>
            </div>
          </section>

          <section className="py-10 sm:py-12">
            <div className="grid gap-4 lg:grid-cols-3">
              {installWays.map((step) => (
                <article
                  key={step.title}
                  className="group rounded-3xl border border-subtle bg-surface-layer p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${step.tintClass} ${step.accentClass}`}>
                        <step.icon size={22} />
                      </div>
                      <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.2em] ${step.accentClass}`}>
                        {step.subtitle}
                      </p>
                      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text-primary">
                        {step.title}
                      </h2>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    {step.steps.map((item) => (
                      <div key={item} className="flex items-start gap-3 rounded-2xl bg-surface-elevated px-4 py-3">
                        <CheckCircle size={16} className={`mt-0.5 flex-shrink-0 ${step.accentClass}`} />
                        <span className="text-sm leading-[1.5] text-text-secondary">{item}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </PublicEditorialShell>
  );
};

export default DownloadPage;
