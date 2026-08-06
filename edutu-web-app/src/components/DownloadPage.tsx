import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  ChevronDown,
  Download,
  RefreshCw,
  Share,
  ShieldCheck,
  WifiOff,
  Zap,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import usePWA from "../hooks/usePWA";

// Direct APK download. Swap this for the latest release URL when a new build ships
// (e.g. a GitHub Releases asset: https://github.com/<org>/<repo>/releases/latest/download/edutu.apk).
const ANDROID_APK_URL = "/downloads/edutu.apk";

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as MacIntel but has touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return "desktop";
}

const BENEFITS = [
  {
    icon: Bell,
    title: "Deadline reminders",
    text: "Nudges before applications close, not after.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    text: "Saved opportunities stay readable on flaky data.",
  },
  {
    icon: Zap,
    title: "Opens instantly",
    text: "Straight from your home screen, no browser detour.",
  },
  {
    icon: RefreshCw,
    title: "Always in sync",
    text: "Phone, laptop, tablet — one account, same progress.",
  },
];

const FAQS = [
  {
    q: "Is Edutu free to install?",
    a: "Yes. Installing the app is completely free, and so is browsing opportunities. Some coaching features have Pro plans, but you'll never pay to install or search.",
  },
  {
    q: "Is the Android download safe?",
    a: "Yes — it's the official build, published directly by the Edutu team, and it's the same app that's heading to the Play Store. Android may ask you to allow installs from your browser the first time; that's standard for apps installed outside the store.",
  },
  {
    q: "Do I need Google Play or the App Store?",
    a: "No. Android gets a direct download from us today, and every device can install Edutu straight from the browser in a few taps. Store listings are on the way for people who prefer them.",
  },
  {
    q: "Will my saved opportunities sync between devices?",
    a: "Yes. Sign in with the same account anywhere and your saved opportunities, applications, and deadlines follow you.",
  },
];

/**
 * Miniature of the real app's home feed — the hero imagery. Deliberately
 * light-surface regardless of theme: it's a picture of the product, not UI.
 */
function PhoneMockup() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-[248px] rounded-[2.6rem] bg-slate-900 p-2 shadow-elevated ring-1 ring-white/20 sm:w-[264px]"
    >
      <div className="relative overflow-hidden rounded-[2.1rem] bg-slate-50">
        {/* status bar + notch */}
        <div className="flex items-center justify-between px-5 pt-2.5 text-[10px] font-semibold text-slate-900">
          <span>9:41</span>
          <span className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-slate-900" />
          <span className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-900/80" />
            <span className="h-2 w-2 rounded-full bg-slate-900/50" />
          </span>
        </div>

        <div className="space-y-3 px-4 pb-4 pt-3">
          <div>
            <p className="text-sm font-bold text-slate-900">
              Hey, Amina 👋
            </p>
            <p className="text-[10px] font-medium text-slate-500">
              3 deadlines this week — you're on track
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-[#ffffff] px-3 py-2 shadow-sm ring-1 ring-slate-200">
            <span className="h-3 w-3 rounded-full border-[1.5px] border-slate-400" />
            <span className="text-[10px] text-slate-400">
              Search scholarships…
            </span>
          </div>

          <p className="pt-1 text-[10px] font-bold text-slate-900">
            Top matches for you
          </p>

          {[
            {
              org: "Mastercard Foundation",
              title: "Scholars Program 2027",
              match: "Excellent fit",
              due: "Due in 12 days",
              dueTone: "bg-amber-100 text-amber-700",
            },
            {
              org: "Google Africa",
              title: "Developer Scholarship",
              match: "Strong fit",
              due: "Due in 30 days",
              dueTone: "bg-emerald-100 text-emerald-700",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl bg-[#ffffff] p-3 shadow-sm ring-1 ring-slate-200"
            >
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                {card.org}
              </p>
              <p className="mt-0.5 text-xs font-semibold leading-tight text-slate-900">
                {card.title}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">
                  {card.match}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${card.dueTone}`}
                >
                  {card.due}
                </span>
              </div>
            </div>
          ))}

          {/* bottom nav hint */}
          <div className="flex items-center justify-around rounded-full bg-[#ffffff] px-4 py-2.5 shadow-sm ring-1 ring-slate-200">
            <span className="h-3.5 w-3.5 rounded-md bg-blue-600" />
            <span className="h-3.5 w-3.5 rounded-md bg-slate-300" />
            <span className="h-3.5 w-3.5 rounded-md bg-slate-300" />
            <span className="h-3.5 w-3.5 rounded-md bg-slate-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

const AppleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 384 512" aria-hidden="true">
    <path
      fill="currentColor"
      d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
    />
  </svg>
);

const PlayLogo = () => (
  <svg width="16" height="18" viewBox="0 0 512 512" aria-hidden="true">
    <path
      fill="currentColor"
      d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"
    />
  </svg>
);

function StoreBadge({ store, icon }: { store: string; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 rounded-xl border border-white/25 px-3.5 py-2 text-left">
      {icon}
      <span className="leading-tight">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/80">
          Coming soon to
        </span>
        <span className="block text-sm font-bold text-white">{store}</span>
      </span>
    </span>
  );
}

const DownloadPage = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { isInstallable, isInstalled, promptInstall } = usePWA();
  const [justInstalled, setJustInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());
  const visitorPlatform = useMemo(() => detectPlatform(), []);

  const installed = isInstalled || justInstalled;

  const scrollToGuide = () => {
    document.getElementById("install-guide")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const handleWebInstall = async () => {
    if (installed) {
      navigate("/dashboard");
      return;
    }
    if (isInstallable) {
      const accepted = await promptInstall();
      if (accepted) setJustInstalled(true);
      return;
    }
    scrollToGuide();
  };

  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const order: Platform[] = ["android", "ios", "desktop"];
    const index = order.indexOf(platform);
    const next =
      event.key === "ArrowRight"
        ? order[(index + 1) % order.length]
        : order[(index - 1 + order.length) % order.length];
    setPlatform(next);
    document.getElementById(`platform-tab-${next}`)?.focus();
  };

  const enter = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.5,
            delay,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  const tabClass = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
      active
        ? "bg-surface-layer text-text-primary shadow-soft"
        : "text-text-muted hover:text-text-primary"
    }`;

  const stepItem = (index: number, children: ReactNode) => (
    <li key={index} className="flex items-start gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
        {index + 1}
      </span>
      <span className="pt-1 text-base leading-relaxed text-text-primary">
        {children}
      </span>
    </li>
  );

  return (
    <PublicEditorialShell>
      <Seo
        title="Download Edutu — get the app on any device"
        description="Download Edutu for Android today, or install it straight from your browser on iPhone and desktop. Deadline reminders, offline access, and your personalized opportunity feed."
        path="/download"
      />

      <div className="py-6 sm:py-10">
        {/* ── Hero: committed brand panel ─────────────────────────── */}
        <section className="relative overflow-hidden rounded-[2rem] bg-brand-700 sm:rounded-[2.5rem]">
          {/* depth: soft light pools + faint grid, same language as /auth */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(255,255,255,0.14),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(30,64,175,0.75),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:44px_44px]" />

          <div className="relative grid gap-10 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[1.15fr_auto] lg:items-center lg:gap-14 lg:px-14">
            <motion.div {...enter(0)}>
              <h1 className="max-w-xl font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.05] tracking-tight text-white [text-wrap:balance]">
                Take every opportunity with you.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-[1.7] text-white/85 sm:text-base">
                The Edutu app is here — download it for Android today, or
                install it straight from your browser on any device. Your
                matches, deadlines, and AI coach, one tap from your home
                screen.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {visitorPlatform === "android" ? (
                  <a
                    href={ANDROID_APK_URL}
                    download
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-[#ffffff] px-7 text-sm font-semibold text-brand-700 no-underline shadow-elevated transition hover:-translate-y-0.5 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:hover:translate-y-0"
                  >
                    <Download size={17} />
                    Download for Android
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleWebInstall()}
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-[#ffffff] px-7 text-sm font-semibold text-brand-700 shadow-elevated transition hover:-translate-y-0.5 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:hover:translate-y-0"
                  >
                    {installed ? <Check size={17} /> : <Download size={17} />}
                    {installed
                      ? "Installed — open Edutu"
                      : isInstallable
                        ? "Install Edutu now"
                        : "See install steps"}
                  </button>
                )}
                <Link
                  to="/auth"
                  className="inline-flex h-12 items-center rounded-full border border-white/40 px-6 text-sm font-semibold text-white no-underline transition hover:border-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Use Edutu on the web
                </Link>
              </div>

              <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-white/80">
                <ShieldCheck size={14} className="shrink-0" />
                Free · official build from the Edutu team · works offline
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/15 pt-6 text-white">
                <StoreBadge store="Google Play" icon={<PlayLogo />} />
                <StoreBadge store="App Store" icon={<AppleLogo />} />
              </div>
            </motion.div>

            <motion.div {...enter(0.15)} className="lg:pr-2">
              <PhoneMockup />
            </motion.div>
          </div>
        </section>

        {/* ── Why get the app ─────────────────────────────────────── */}
        <section
          aria-label="Why get the Edutu app"
          className="mx-auto grid max-w-5xl gap-x-8 gap-y-7 px-2 py-12 sm:grid-cols-2 sm:py-14 lg:grid-cols-4"
        >
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="flex gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <benefit.icon size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  {benefit.title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  {benefit.text}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Install guide ───────────────────────────────────────── */}
        <section
          id="install-guide"
          className="mx-auto max-w-3xl scroll-mt-24 rounded-[2rem] border border-subtle bg-surface-layer p-6 shadow-soft sm:p-10"
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl [text-wrap:balance]">
            Get set up in under a minute
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Pick your device — we've highlighted the one you're on.
          </p>

          <div
            role="tablist"
            aria-label="Choose your device"
            onKeyDown={handleTabKeys}
            className="mt-6 inline-flex max-w-full flex-wrap gap-1 rounded-full bg-surface-elevated p-1"
          >
            {(
              [
                ["android", "Android"],
                ["ios", "iPhone & iPad"],
                ["desktop", "Desktop"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                id={`platform-tab-${id}`}
                role="tab"
                aria-selected={platform === id}
                aria-controls={`platform-panel-${id}`}
                tabIndex={platform === id ? 0 : -1}
                onClick={() => setPlatform(id)}
                className={tabClass(platform === id)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Android: the direct APK is the lead path */}
          {platform === "android" && (
            <div
              key="android"
              id="platform-panel-android"
              role="tabpanel"
              aria-labelledby="platform-tab-android"
              className="mt-6 motion-safe:animate-fade-in"
            >
              <ol className="space-y-3">
                {stepItem(
                  0,
                  <>
                    Tap <strong>Download APK</strong> — the file starts
                    downloading right away
                  </>,
                )}
                {stepItem(
                  1,
                  <>
                    Open the downloaded file and allow installs from your
                    browser if Android asks
                  </>,
                )}
                {stepItem(
                  2,
                  <>
                    Launch Edutu, sign in, and everything stays synced with
                    the web app
                  </>,
                )}
              </ol>

              <a
                href={ANDROID_APK_URL}
                download
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white no-underline shadow-soft transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <Download size={16} />
                Download APK
              </a>

              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                <ShieldCheck
                  size={15}
                  className="mt-1 shrink-0 text-brand"
                />
                Official build, published directly by the Edutu team. Coming
                to the Play Store soon. Prefer no APK? Chrome can also install
                Edutu straight from the browser menu.
              </p>
            </div>
          )}

          {/* iPhone: App Store coming soon, Safari install today */}
          {platform === "ios" && (
            <div
              key="ios"
              id="platform-panel-ios"
              role="tabpanel"
              aria-labelledby="platform-tab-ios"
              className="mt-6 motion-safe:animate-fade-in"
            >
              <ol className="space-y-3">
                {stepItem(
                  0,
                  <>
                    Open <strong>edutu.org</strong> in Safari
                  </>,
                )}
                {stepItem(
                  1,
                  <>
                    Tap the{" "}
                    <Share
                      size={14}
                      className="inline -mt-0.5"
                      aria-label="Share"
                    />{" "}
                    Share button in the toolbar
                  </>,
                )}
                {stepItem(
                  2,
                  <>
                    Scroll down and choose <strong>Add to Home Screen</strong>
                  </>,
                )}
              </ol>

              <p className="mt-5 flex items-start gap-2 rounded-2xl bg-surface-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                <Bell size={15} className="mt-1 shrink-0 text-brand" />
                The iPhone app is on its way to the App Store — early web
                users will be the first to know. Until then, Safari's Home
                Screen install gives you the full app experience.
              </p>
            </div>
          )}

          {/* Desktop: browser install */}
          {platform === "desktop" && (
            <div
              key="desktop"
              id="platform-panel-desktop"
              role="tabpanel"
              aria-labelledby="platform-tab-desktop"
              className="mt-6 motion-safe:animate-fade-in"
            >
              <ol className="space-y-3">
                {stepItem(
                  0,
                  <>
                    Open <strong>edutu.org</strong> in Chrome or Edge
                  </>,
                )}
                {stepItem(
                  1,
                  <>
                    Click the{" "}
                    <Download
                      size={14}
                      className="inline -mt-0.5"
                      aria-label="install"
                    />{" "}
                    install icon at the right end of the address bar
                  </>,
                )}
                {stepItem(
                  2,
                  <>
                    Confirm <strong>Install</strong> — Edutu opens in its own
                    window
                  </>,
                )}
              </ol>

              <p className="mt-5 rounded-2xl bg-surface-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                Pin it to your dock or taskbar and Edutu is one click away,
                every day.
              </p>

              {isInstallable && !installed && (
                <button
                  type="button"
                  onClick={() => void handleWebInstall()}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  <Download size={16} />
                  Skip the steps — install now
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── FAQ + closing CTA ───────────────────────────────────── */}
        <section
          aria-label="Frequently asked questions"
          className="mx-auto max-w-3xl px-2 py-12 sm:py-14"
        >
          <h2 className="font-display text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            Good to know
          </h2>
          <div className="mt-5 divide-y divide-border-subtle border-y border-subtle">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown
                    size={17}
                    className="shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 max-w-[65ch] text-sm leading-7 text-text-secondary">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[2rem] bg-surface-brand px-6 py-6 sm:px-8">
            <p className="max-w-md text-base font-semibold leading-6 text-text-primary">
              Ready when you are — your next opportunity is one tap away.
            </p>
            {visitorPlatform === "android" ? (
              <a
                href={ANDROID_APK_URL}
                download
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white no-underline shadow-soft transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <Download size={16} />
                Download for Android
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void handleWebInstall()}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {installed ? "Open Edutu" : "Get the app"}
              </button>
            )}
          </div>
        </section>
      </div>
    </PublicEditorialShell>
  );
};

export default DownloadPage;
