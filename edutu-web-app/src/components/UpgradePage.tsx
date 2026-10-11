import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronDown, CreditCard, ShieldCheck, Sparkles, X } from "lucide-react";
import Seo from "./Seo";
import PlanPicker from "../features/feature-access/PlanPicker";
import { usePaywall } from "../hooks/usePaywall";
import "./upgradePage.css";

const faqs = [
  { question: "What can I do with a paid plan?", answer: "Paid tiers include AI Coach, CV and cover letter support, opportunity fit insights, Copilot, document tools and preparation plans. Usage allowances depend on your tier." },
  { question: "How do Lite, Pro and Scholar compare?", answer: "Each tier includes the preparation tools. The main differences are daily AI messages, voice minutes and action credits. Choose a tier to see its allowances." },
  { question: "Will I be charged again?", answer: "Check the terms next to the price. Recurring products renew on the stated schedule. One-time passes do not renew automatically. You can review existing payments and manage eligible subscriptions from your wallet." },
  { question: "When does my access begin?", answer: "We activate your access after the payment provider confirms the payment to Edutu. If confirmation is pending, you can check the status in your wallet." },
  { question: "Can I use my plan on web and mobile?", answer: "Yes. Sign in with the same Edutu account on both to use your active plan." },
  { question: "Can I still use Edutu for free?", answer: "Yes. You can browse and search opportunities without paying. Paid plans unlock additional AI guidance and preparation tools." },
];

export default function UpgradePage() {
  const { billing } = usePaywall();
  const navigate = useNavigate();
  const close = () => navigate("/app/opportunities", { replace: true });
  const faqRef = useRef<HTMLDetailsElement>(null);
  return (
    <div className="upgrade-page min-h-screen">
      <Seo
        title="Edutu plans — prepare your next application"
        description="AI coaching, opportunity guidance and application preparation tools in the Edutu web app. Browse opportunities for free."
      />
      <button type="button" className="upgrade-sheet-backdrop" aria-label="Close premium plans" onClick={close} />
      <main className="upgrade-main" id="main-content" aria-label="Edutu Premium plans" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
        <span className="upgrade-sheet-handle" aria-hidden="true" />
        <button type="button" className="upgrade-sheet-close" aria-label="Close premium plans" onClick={close}><X size={20} /></button>
        <header className="upgrade-intro">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <Sparkles size={15} aria-hidden="true" /> Your next opportunity starts here
          </p>
          <h1 className="font-display text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[1.04] tracking-tight">
            Make every application
            <br />count.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
            From finding the right opportunity to preparing your strongest application, choose the AI support that works for you.
          </p>
        </header>

        {billing && billing.planTier !== "none" && (
          <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm">
            <p>
              You have an active <strong className="capitalize">{billing.planTier}</strong> plan. Review your current access before choosing another plan.
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
            <p className="mt-1.5 text-sm text-slate-400">Select a tier and billing option. The price and renewal terms come from our billing system.</p>
          </div>
          <PlanPicker compact docked />

        </section>

        <aside className="upgrade-side">
          <div className="upgrade-payment-steps" aria-labelledby="upgrade-steps-title">
            <p className="upgrade-overline">A clear way to upgrade</p>
            <h2 id="upgrade-steps-title">Choose confidently. Pay securely.</h2>
            <div className="upgrade-step"><span><CheckCircle2 size={19} aria-hidden="true" /></span><div><strong>Find your fit</strong><p>Compare tiers and allowances, then select your billing option.</p></div></div>
            <div className="upgrade-step"><span><CreditCard size={19} aria-hidden="true" /></span><div><strong>Review and pay</strong><p>Confirm the amount and renewal terms in secure checkout.</p></div></div>
            <div className="upgrade-step"><span><ShieldCheck size={19} aria-hidden="true" /></span><div><strong>Get your access</strong><p>Your plan activates once Edutu verifies the payment.</p></div></div>
            <p className="upgrade-payment-note"><ShieldCheck size={16} aria-hidden="true" /> Your wallet tracks plan access, credits and recent payments.</p>
          </div>
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
        </aside>
        </div>
      </main>
    </div>
  );
}
