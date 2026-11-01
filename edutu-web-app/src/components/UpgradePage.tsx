import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, Sparkles, X } from "lucide-react";
import Seo from "./Seo";
import PlanPicker from "../features/feature-access/PlanPicker";
import { usePaywall } from "../hooks/usePaywall";
import "./upgradePage.css";

const faqs = [
  {
    question: "What can I do with a paid plan?",
    answer:
      "Paid tiers include AI Coach, CV and cover letter support, opportunity fit insights, Copilot, document tools and preparation plans. Usage allowances depend on your tier.",
  },
  {
    question: "How do Lite, Pro and Scholar compare?",
    answer:
      "Each tier includes the preparation tools. The main differences are daily AI messages, voice minutes and action credits. Choose a tier to see its allowances.",
  },
  {
    question: "Will I be charged again?",
    answer:
      "Check the terms next to the price. Recurring products renew on the stated schedule. One-time passes do not renew automatically. You can review existing payments and manage eligible subscriptions from your wallet.",
  },
  {
    question: "When does my access begin?",
    answer:
      "We activate your access after the payment provider confirms the payment to Edutu. If confirmation is pending, you can check the status in your wallet.",
  },
  {
    question: "Can I use my plan on web and mobile?",
    answer:
      "Yes. Sign in with the same Edutu account on both to use your active plan.",
  },
  {
    question: "Can I still use Edutu for free?",
    answer:
      "Yes. You can browse and search opportunities without paying. Paid plans unlock additional AI guidance and preparation tools.",
  },
];

export default function UpgradePage() {
  const { billing } = usePaywall();
  const navigate = useNavigate();
  const close = () => navigate("/app/opportunities", { replace: true });
  return (
    <div className="upgrade-page min-h-screen">
      <Seo
        title="Edutu plans — prepare your next application"
        description="AI coaching, opportunity guidance and application preparation tools in the Edutu web app. Browse opportunities for free."
      />
      <main
        className="upgrade-main"
        id="main-content"
        aria-label="Edutu Premium plans"
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <div className="upgrade-topbar">
          <Link to="/dashboard" className="upgrade-brand">
            <img src="/edutu-logo-mark.png" alt="" />
            <span>
              Edutu <span>Plans</span>
            </span>
          </Link>
          <button
            type="button"
            className="upgrade-sheet-close"
            aria-label="Close premium plans"
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <header className="upgrade-intro">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <Sparkles size={15} aria-hidden="true" /> Your next opportunity
            starts here
          </p>
          <h1 className="font-display text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[1.04] tracking-tight">
            Make every application count.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
            From finding the right opportunity to preparing your strongest
            application, choose the AI support that works for you.
          </p>
        </header>

        {billing && billing.planTier !== "none" && (
          <div className="upgrade-active-plan">
            <p>
              You have an active{" "}
              <strong className="capitalize">{billing.planTier}</strong> plan.
              Review your current access before choosing another plan.
            </p>
            <Link
              className="inline-flex items-center gap-2 font-semibold text-blue-300"
              to="/app/wallet"
            >
              Open wallet <ArrowRight size={16} />
            </Link>
          </div>
        )}

        <div className="upgrade-layout">
          <section
            className="upgrade-plans"
            aria-labelledby="plan-picker-heading"
          >
            <div className="upgrade-section-title">
              <h2
                id="plan-picker-heading"
                className="text-xl font-semibold tracking-tight sm:text-2xl"
              >
                Choose your plan
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Choose your level of support, then select a billing period.
              </p>
            </div>
            <PlanPicker compact docked />
          </section>

          <section
            className="upgrade-faq"
            aria-labelledby="upgrade-faq-heading"
          >
            <div className="upgrade-section-title">
              <h2 id="upgrade-faq-heading">A few things to know</h2>
              <p>Plan access, payments and what stays free.</p>
            </div>
            <div className="upgrade-faq-list">
              {faqs.map(({ question, answer }) => (
                <details key={question} className="upgrade-faq-item">
                  <summary>
                    <span>{question}</span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
            <Link className="upgrade-faq-help" to="/help">
              Visit the help center <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
