import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { team, initialsOf, type TeamMember } from "../lib/team";

/**
 * Meet-the-team row — vivid cards showing each person's name + role over a
 * portrait sat on an organic colour blob. The team is small enough to sit
 * still and centred; members without a portrait show an initials monogram on
 * the blob rather than a stock photo.
 */

const BLOB_RADIUS = "46% 54% 52% 48% / 54% 46% 58% 42%";

function TeamCard({ member }: { member: TeamMember }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(member.src) && !failed;

  return (
    <article
      className="relative flex h-[344px] w-[236px] shrink-0 flex-col overflow-hidden rounded-3xl p-5 shadow-elevated transition-transform duration-300 hover:-translate-y-1 sm:h-[376px] sm:w-[262px]"
      style={{ background: member.cardBg, color: member.text }}
    >
      {/* colour is set per element, not inherited: index.css gives bare `p`
          and `h3` their own colour, which would otherwise win over the card. */}
      <p
        className="text-sm font-medium opacity-75"
        style={{ color: member.text }}
      >
        {member.name}
      </p>
      <h3
        className="mt-1 font-display text-2xl font-bold leading-[1.08] sm:text-2xl"
        style={{ color: member.text }}
      >
        {member.role}
      </h3>

      <div className="relative mx-auto mt-auto aspect-square w-40 sm:w-44">
        <div
          className="absolute inset-0"
          style={{ background: member.blob, borderRadius: BLOB_RADIUS }}
        />
        {showPhoto ? (
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
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center font-display text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: member.text }}
            aria-hidden="true"
          >
            {initialsOf(member.name)}
          </div>
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

  return (
    <section id={id} className={`overflow-hidden py-16 sm:py-20 ${className}`}>
      <div className="mx-auto mb-10 max-w-6xl px-4 text-center sm:mb-12 sm:px-6">
        <span className="inline-flex items-center rounded-full border border-subtle bg-surface-layer px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Our people
        </span>
        <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl font-semibold leading-[1.08] tracking-tight text-text-primary sm:text-4xl">
          Meet the team building <span className="text-brand">Edutu</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-text-secondary">
          A small, global team obsessed with getting more learners into
          life-changing opportunities.
        </p>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-4 px-4 sm:gap-5 sm:px-6">
        {team.map((member, i) => (
          <motion.div
            key={member.name}
            initial={reduce ? undefined : { opacity: 0, y: 24 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
          >
            <TeamCard member={member} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
