import { useState } from "react";
import { UserRound } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Meet-the-team marquee — a full-bleed, edge-to-edge row of vivid team cards
 * that scrolls continuously. Each card shows a name + role over a portrait sat
 * on an organic colour blob, echoing the reference "brand" team layout.
 */

interface TeamMember {
  name: string;
  role: string;
  src: string;
  /** card background */
  cardBg: string;
  /** organic blob behind the portrait */
  blob: string;
  /** text colour that reads on the card */
  text: string;
}

// Portrait ids proven to resolve; roles map to Edutu's team.
const team: TeamMember[] = [
  {
    name: "Amara Okafor",
    role: "Founder & CEO",
    src: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=360&q=80&auto=format&fit=crop",
    cardBg: "#F4B7D4",
    blob: "#B6E64A",
    text: "#231018",
  },
  {
    name: "Kwame Asante",
    role: "Head of Product",
    src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=360&q=80&auto=format&fit=crop",
    cardBg: "#EA5A1F",
    blob: "#2F4BE0",
    text: "#FFFFFF",
  },
  {
    name: "Leila Sharma",
    role: "Lead Engineer",
    src: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=360&q=80&auto=format&fit=crop",
    cardBg: "#F5CE1B",
    blob: "#F4A6C7",
    text: "#3A2E05",
  },
  {
    name: "Julian Reyes",
    role: "Community Lead",
    src: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=360&q=80&auto=format&fit=crop",
    cardBg: "#2F4BE0",
    blob: "#FFFFFF",
    text: "#FFFFFF",
  },
  {
    name: "Ethan Blake",
    role: "Head of Partnerships",
    src: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=360&q=80&auto=format&fit=crop",
    cardBg: "#2E5A3B",
    blob: "#4FD1E0",
    text: "#FFFFFF",
  },
  {
    name: "Zainab Musa",
    role: "Design Lead",
    src: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=360&q=80&auto=format&fit=crop",
    cardBg: "#6D3BEA",
    blob: "#F5B301",
    text: "#FFFFFF",
  },
  {
    name: "Daniel Mensah",
    role: "Growth Lead",
    src: "https://images.unsplash.com/photo-1552058544-f2b08422138a?w=360&q=80&auto=format&fit=crop",
    cardBg: "#0EA5A5",
    blob: "#FDE047",
    text: "#04201F",
  },
];

const BLOB_RADIUS = "46% 54% 52% 48% / 54% 46% 58% 42%";

function TeamCard({ member }: { member: TeamMember }) {
  const [failed, setFailed] = useState(false);
  return (
    <article
      className="relative flex h-[344px] w-[236px] shrink-0 flex-col overflow-hidden rounded-3xl p-5 shadow-elevated transition-transform duration-300 hover:-translate-y-1 sm:h-[376px] sm:w-[262px]"
      style={{ background: member.cardBg, color: member.text }}
    >
      <p className="text-[13px] font-medium opacity-75">{member.name}</p>
      <h3 className="mt-1 font-display text-2xl font-bold leading-[1.08] sm:text-[26px]">
        {member.role}
      </h3>

      <div className="relative mx-auto mt-auto aspect-square w-40 sm:w-44">
        <div
          className="absolute inset-0"
          style={{ background: member.blob, borderRadius: BLOB_RADIUS }}
        />
        {failed ? (
          <div
            className="absolute inset-[7px] flex items-center justify-center"
            style={{ borderRadius: BLOB_RADIUS, background: member.cardBg }}
          >
            <UserRound size={40} style={{ color: member.blob }} />
          </div>
        ) : (
          <img
            src={member.src}
            alt={`${member.name}, ${member.role}`}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-[7px] object-cover object-top"
            style={{
              width: "calc(100% - 14px)",
              height: "calc(100% - 14px)",
              borderRadius: BLOB_RADIUS,
            }}
          />
        )}
      </div>
    </article>
  );
}

interface MeetTheTeamProps {
  id?: string;
  className?: string;
}

export default function MeetTheTeam({ id, className = "" }: MeetTheTeamProps) {
  const reduce = useReducedMotion();
  const loop = [...team, ...team];

  return (
    <section
      id={id}
      className={`overflow-hidden py-16 sm:py-20 ${className}`}
    >
      <div className="mx-auto mb-10 max-w-6xl px-4 text-center sm:mb-12 sm:px-6">
        <span className="inline-flex items-center rounded-full border border-subtle bg-surface-layer px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Our people
        </span>
        <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl font-semibold leading-[1.08] tracking-tight text-text-primary sm:text-4xl">
          Meet the team building{" "}
          <span className="text-brand">Edutu</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-text-secondary">
          A small, global team obsessed with getting more learners into
          life-changing opportunities.
        </p>
      </div>

      {/* full-bleed marquee */}
      <div className="relative">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface-body to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface-body to-transparent sm:w-28" />

        <motion.div
          className="flex w-max gap-4 px-4 sm:gap-5"
          animate={reduce ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 48, repeat: Infinity, ease: "linear" }}
        >
          {loop.map((member, i) => (
            <TeamCard key={`${member.name}-${i}`} member={member} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
