import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Download, Globe, Smartphone } from 'lucide-react';
import PublicEditorialShell from './PublicEditorialShell';

const installWays = [
  {
    title: 'Android',
    subtitle: 'Install from the browser menu',
    icon: Smartphone,
    accent: '#146ef5',
    steps: ['Open Edutu in Chrome', 'Use the browser menu', 'Choose Install app or Add to Home screen'],
  },
  {
    title: 'iPhone',
    subtitle: 'Save Edutu to your Home Screen',
    icon: Globe,
    accent: '#7a3dff',
    steps: ['Open Edutu in Safari', 'Tap Share', 'Choose Add to Home Screen'],
  },
  {
    title: 'Desktop',
    subtitle: 'Use Edutu like a native app',
    icon: Download,
    accent: '#00b86b',
    steps: ['Open the site in Chrome or Edge', 'Install from the address bar', 'Sign in to keep everything synced'],
  },
] as const satisfies Array<{
  title: string;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
  steps: string[];
}>;

const DownloadPage: React.FC = () => {
  return (
    <PublicEditorialShell>
      <main className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <section className="space-y-6 border-b pb-10 sm:pb-12">
            <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#146ef5]">
              <Download size={14} />
              Download app
            </div>

            <div className="max-w-3xl space-y-4">
              <h1 className="text-[clamp(2rem,4.4vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.035em]">
                Install Edutu once.
                <span className="block text-[#146ef5]">Use it anywhere.</span>
              </h1>

              <p className="max-w-2xl text-[15px] leading-[1.7] text-slate-600 sm:text-[16px]">
                Keep saved opportunities, deadlines, and progress within reach on mobile or desktop. Edutu works in your browser and can be added to your home screen in a few steps.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-full bg-[#146ef5] px-6 py-3 text-sm font-semibold text-white no-underline transition-transform duration-200 hover:translate-y-[-1px]"
              >
                Open Edutu
              </Link>
              <Link
                to="/opportunities"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 no-underline transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
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
                  className="rounded-[24px] border bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: `${step.accent}12`, color: step.accent }}
                      >
                        <step.icon size={22} />
                      </div>
                      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: step.accent }}>
                        {step.subtitle}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-900">
                        {step.title}
                      </h2>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    {step.steps.map((item) => (
                      <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                        <CheckCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: step.accent }} />
                        <span className="text-sm leading-[1.5] text-slate-600">{item}</span>
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
