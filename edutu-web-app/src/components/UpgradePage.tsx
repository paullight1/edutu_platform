import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import PublicHeader from "./PublicHeader";
import SiteFooter from "./SiteFooter";
import Seo from "./Seo";
import PlanPicker from "../features/feature-access/PlanPicker";
import { usePaywall } from "../hooks/usePaywall";
const benefits = [
  "Check your fit and choose your next move on each opportunity",
  "Prepare application materials with Copilot",
  "Talk through applications with AI Coach and voice",
  "Save preparation plans, organize documents and follow goals",
  "Keep up with saved searches and alerts",
];
export default function UpgradePage() {
  const { billing } = usePaywall();
  return (
    <>
      <Seo
        title="Edutu plans — prepare your next application"
        description="AI coaching, opportunity guidance and application preparation tools in the Edutu web app. Browse opportunities for free."
      />
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <header className="mb-12 max-w-2xl">
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand">
            <Sparkles size={18} /> More support for your next application
          </p>
          <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1.05] tracking-tight">
            Find your opportunity.
            <br />
            <span className="text-brand">Make your next move.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-text-secondary">
            Bring the guidance and preparation tools from Edutu mobile to your
            browser. Get practical AI help for the opportunity in front of you,
            and keep your work in one place.
          </p>
        </header>
        {billing && billing.planTier !== "none" && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-5">
            <p className="text-sm">
              Your <strong className="capitalize">{billing.planTier}</strong>{" "}
              plan is active. Review your access, allowances and renewal in your
              wallet.
            </p>
            <Link
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
              to="/app/wallet"
            >
              Open wallet <ArrowRight size={16} />
            </Link>
          </div>
        )}
        <PlanPicker />
        <section className="my-14 grid gap-8 border-t border-subtle pt-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              From discovery to preparation
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              All paid tiers include these tools. AI and voice allowances vary
              by plan and are checked before you use them.
            </p>
          </div>
          <ul className="space-y-4">
            {benefits.map((v) => (
              <li key={v} className="flex gap-3 text-sm leading-relaxed">
                <Check size={18} className="shrink-0 text-brand" />
                {v}
              </li>
            ))}
          </ul>
        </section>
        <section className="grid gap-6 border-t border-subtle pt-10 sm:grid-cols-2">
          <div>
            <h2 className="font-semibold">What stays free?</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Explore, search and browse opportunities, including older
              listings. Open the official application page whenever you are
              ready.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Will my purchase renew?</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Each plan shows its renewal terms before checkout. One-time passes
              end after the stated access period; recurring plans can be managed
              from your wallet.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Does mobile access carry over?</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Sign in with the same Edutu account. Web tools use the shared
              backend to check your active plan and usage.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">When does access start?</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              After the payment is confirmed and applied on the server. If you
              return before confirmation arrives, your wallet shows the pending
              payment status.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
