import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PlanMascotWelcome() {
  const navigate = useNavigate();

  return (
    <section className="mb-5 flex items-center gap-3 overflow-hidden rounded-[20px] border border-brand/15 bg-brand/[0.06] px-3 py-3 sm:px-4" aria-label="About My Plan">
      <div className="flex h-16 w-16 shrink-0 items-end justify-center rounded-[20px] bg-brand/10 sm:h-20 sm:w-20">
        <img src="/mascot/edutu-profile-guide.png" alt="Edutu mascot welcoming you to My Plan" className="h-[4.5rem] w-[4.5rem] object-contain object-bottom sm:h-[5.5rem] sm:w-[5.5rem]" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-sm font-semibold text-text-primary sm:text-base">Your plan, one clear next step at a time</h2>
        <p className="mt-1 text-xs leading-5 text-text-secondary">Track your progress, organize applications, and stay ahead of deadlines.</p>
      </div>
      <button type="button" onClick={() => navigate("/app/deadlines")} className="hidden shrink-0 items-center gap-1 rounded-[20px] border border-brand/20 px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand/10 sm:inline-flex">View deadlines <ArrowRight size={14} /></button>
    </section>
  );
}
