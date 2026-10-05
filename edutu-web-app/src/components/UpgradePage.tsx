import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, Sparkles, X } from "lucide-react";
import Seo from "./Seo";
import PlanPicker from "../features/feature-access/PlanPicker";
import { usePaywall } from "../hooks/usePaywall";
import "./upgradePage.css";

const faqs = [
  { question: "What does a paid plan include?", answer: "Every paid plan unlocks AI Coach, CV and cover letter help, opportunity fit insights, document analysis, preparation plans and goals." },
  { question: "How are Lite, Pro and Scholar different?", answer: "All three unlock the preparation toolkit. Their AI and voice allowances differ. Your wallet shows the limits and remaining usage for your active plan." },
  { question: "Will my plan renew automatically?", answer: "All Lite, Pro, and Scholar plans renew automatically on their weekly, monthly, or yearly schedule. Manage or cancel renewal from your wallet." },
  { question: "When does my access start?", answer: "Access is added once your payment is confirmed. If a payment is pending, open your wallet to check its status before starting another checkout." },
  { question: "Can I use my plan on web and mobile?", answer: "Yes. Sign in with the same Edutu account on both to use your active plan." },
  { question: "Can I keep using Edutu for free?", answer: "Yes. Browsing and searching opportunities, including archived listings, stays free. AI guidance and preparation features require a paid plan." },
];

export default function UpgradePage() {
  const { billing } = usePaywall();
  const navigate = useNavigate();
  const close = () => navigate("/app/opportunities", { replace: true });
  const faqRef = useRef<HTMLDetailsElement>(null);
  return (
    <div className="upgrade-page min-h-screen bg-[#090d18] text-white">
      <Seo
        title="Edutu plans — prepare your next application"
        description="AI coaching, opportunity guidance and application preparation tools in the Edutu web app. Browse opportunities for free."
      />
      <button className="upgrade-sheet-backdrop" aria-label="Close premium plans" onClick={close} />
      <main className="upgrade-main" id="main-content" aria-label="Edutu Premium plans" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
        <span className="upgrade-sheet-handle" aria-hidden="true" />
        <button type="button" className="upgrade-sheet-close" aria-label="Close premium plans" onClick={close}><X size={20} /></button>
        <div className="upgrade-hero" aria-hidden="true"><img src="/images/edutu-premium-hero.png" alt="" /></div>
        <header className="upgrade-intro">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <Sparkles size={15} aria-hidden="true" /> Edutu Premium
          </p>
          <h1 className="font-display text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[1.04] tracking-tight">
            Your ambition.
            <br />A stronger application.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
            Get AI guidance, sharpen your CV and prepare with confidence.
          </p>
        </header>

        {billing && billing.planTier !== "none" && (
          <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm">
            <p>
              Your <strong className="capitalize">{billing.planTier}</strong> plan is active. Review your access and limits in your wallet.
            </p>
            <Link className="inline-flex items-center gap-2 font-semibold text-blue-300" to="/app/wallet">
              Open wallet <ArrowRight size={16} />
            </Link>
          </div>
        )}

        <div className="upgrade-layout">
        <section className="upgrade-plans" aria-labelledby="plan-picker-heading">
          <div className="upgrade-section-title">
            <h2 id="plan-picker-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">Choose your plan</h2>
            <p className="mt-1.5 text-sm text-slate-400">Pick the support that fits your next move.</p>
          </div>
          <PlanPicker compact docked />

        </section>

        <details ref={faqRef} className="upgrade-faq-dropdown">
          <summary>FAQs <ChevronDown size={18} aria-hidden="true" /></summary>
          <section className="upgrade-faq" aria-label="Frequently asked questions">
            <div className="upgrade-faq-panel-header"><h2>Questions</h2><button type="button" aria-label="Close FAQs" onClick={() => { if (faqRef.current) { faqRef.current.open = false; faqRef.current.querySelector("summary")?.focus(); } }}><X size={18} aria-hidden="true" /></button></div>
          <div className="upgrade-faq-list">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="upgrade-faq-item">
                <summary><span>{question}</span><ChevronDown size={18} aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <Link className="upgrade-faq-help" to="/help">Still have a question? Visit our help center <ArrowRight size={15} aria-hidden="true" /></Link>
        </section>
        </details>
        </div>
      </main>
    </div>
  );
}
