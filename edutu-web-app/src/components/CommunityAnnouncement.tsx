import { useEffect, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspaceNotice } from "./workspaceNoticeContext";

const DISMISSED_KEY = "edutu_communities_announcement_v1";
const REVEAL_DELAY_MS = 900;

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function CommunityConstellation() {
  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      viewBox="0 0 380 142"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="community-glow" cx="0" cy="0" r="1" gradientTransform="translate(190 80) rotate(90) scale(92 166)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" stopOpacity=".2" />
          <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="community-fade" x1="190" y1="0" x2="190" y2="142" gradientUnits="userSpaceOnUse">
          <stop offset=".62" stopColor="#15110f" stopOpacity="0" />
          <stop offset="1" stopColor="#15110f" />
        </linearGradient>
      </defs>

      <rect width="380" height="142" fill="url(#community-glow)" />
      <g stroke="#2563eb" strokeOpacity=".36" strokeWidth="1.2">
        <path d="M31 83 94 45l95 36 79-44 78 42" />
        <path d="m52 34 72 58 65-11 86 43" />
        <path d="m94 45 30 47 65-11 79-44" />
        <path d="m31 83 93 9 64 35 80-90" />
      </g>
      <g fill="#2563eb">
        <circle cx="124" cy="92" r="3.5" />
        <circle cx="189" cy="81" r="4.5" />
        <circle cx="268" cy="37" r="3.5" />
      </g>

      {[
        { x: 31, y: 83, r: 23, active: false },
        { x: 94, y: 45, r: 27, active: false },
        { x: 189, y: 81, r: 34, active: true },
        { x: 268, y: 37, r: 25, active: false },
        { x: 346, y: 79, r: 22, active: false },
      ].map(({ x, y, r, active }) => (
        <g key={`${x}-${y}`}>
          <circle
            cx={x}
            cy={y}
            r={r}
            fill={active ? "#0d1b3e" : "#111c35"}
            stroke="#2563eb"
            strokeOpacity={active ? ".9" : ".38"}
            strokeWidth={active ? "1.6" : "1.1"}
          />
          <circle
            cx={x}
            cy={y - r * 0.24}
            r={r * 0.2}
            fill={active ? "#60a5fa" : "#7188b7"}
            fillOpacity={active ? "1" : ".8"}
          />
          <path
            d={`M ${x - r * 0.43} ${y + r * 0.48}c0-${r * 0.3} ${r * 0.2}-${r * 0.47} ${r * 0.43}-${r * 0.47}s${r * 0.43} ${r * 0.17} ${r * 0.43} ${r * 0.47}`}
            fill={active ? "#60a5fa" : "#7188b7"}
            fillOpacity={active ? "1" : ".8"}
          />
        </g>
      ))}
      <rect width="380" height="142" fill="url(#community-fade)" />
    </svg>
  );
}

export default function CommunityAnnouncement() {
  const [visible, setVisible] = useState(false);
  const { pending: blockingNoticePending, open: blockingNoticeOpen } =
    useWorkspaceNotice();

  useEffect(() => {
    if (
      wasDismissed() ||
      blockingNoticePending ||
      blockingNoticeOpen
    ) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [blockingNoticeOpen, blockingNoticePending]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Keep the announcement dismissed for this mount when storage is blocked.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      role="dialog"
      aria-labelledby="community-announcement-title"
      aria-describedby="community-announcement-description"
      className="community-announcement fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[65] overflow-hidden rounded-[24px] border border-white/10 bg-[#15110f] text-[#fffaf4] shadow-[0_28px_80px_-30px_rgba(18,9,5,.88)] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[380px]"
    >
      <div className="relative h-[142px] overflow-hidden">
        <CommunityConstellation />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Communities announcement"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-[#fffaf4]/75 transition hover:border-white/10 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] active:scale-95"
        >
          <X size={21} aria-hidden="true" />
        </button>
      </div>

      <div className="px-7 pb-7">
        <h2
          id="community-announcement-title"
          className="font-display text-[1.3rem] font-semibold leading-tight tracking-[-0.025em] text-[#fffaf4] sm:text-[1.55rem] sm:tracking-[-0.035em]"
        >
          Meet Edutu Communities
        </h2>
        <p
          id="community-announcement-description"
          className="mt-3 text-sm font-medium leading-6 text-[#c7bbb5]"
        >
          Find learners chasing the same opportunities. Share advice, ask
          questions, and grow together.
        </p>
        <Link
          to="/app/community/explore"
          onClick={dismiss}
          className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#2563eb]/70 px-5 text-sm font-bold text-[#60a5fa] transition hover:-translate-y-0.5 hover:border-[#60a5fa] hover:bg-[#2563eb] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 focus-visible:ring-offset-[#15110f] active:translate-y-0 active:scale-[0.98]"
        >
          Explore communities
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
