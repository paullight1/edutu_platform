import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Fanned-arc testimonial / community section. A row of tall portrait cards
 * arcs across the top of a soft panel in a clean rainbow (high in the centre,
 * drooping and clipping at the edges), with ghost cards peeking above and
 * dashed connector lines behind. The centre-bottom of the arc is left open;
 * the headline + dark pill CTA nest into that gap over a soft scrim so the
 * copy always reads. Reused on the landing page ("Join community" →
 * /community) and at the foot of the Community page.
 */

interface Avatar {
  src: string;
  /** vertical offset in px — 0 = high (centre), large = low (edges) */
  offset: number;
  /** subtle organic tilt */
  rotate?: string;
}

// Young African learners — graduates, study sessions, cohort wins (Unsplash),
// ordered left→right so `offset` traces a smooth centre-high arc. Every source
// is a portrait crop so the tall cards never letterbox. Broken loads fall back
// to a branded graduation cap.
const PORTRAIT = "w=300&h=420&q=80&auto=format&fit=crop";
const defaultAvatars: Avatar[] = [
  { src: `https://images.unsplash.com/photo-1770235621081-030607a06cee?${PORTRAIT}`, offset: 148, rotate: "-rotate-3" },
  { src: `https://images.unsplash.com/photo-1620829813573-7c9e1877706f?${PORTRAIT}`, offset: 96 },
  { src: `https://images.unsplash.com/photo-1565490129165-bd6a24996c25?${PORTRAIT}`, offset: 60 },
  { src: `https://images.unsplash.com/photo-1620829813629-45478205c88f?${PORTRAIT}`, offset: 36 },
  { src: `https://images.unsplash.com/photo-1778824717521-a23599f32d71?${PORTRAIT}`, offset: 12 },
  { src: `https://images.unsplash.com/photo-1541339907198-e08756dedf3f?${PORTRAIT}`, offset: 4 },
  { src: `https://images.unsplash.com/photo-1686213011624-8578b598ef0f?${PORTRAIT}`, offset: 0 },
  { src: `https://images.unsplash.com/photo-1628825453863-ccfe2dcc4c70?${PORTRAIT}`, offset: 6 },
  { src: `https://images.unsplash.com/photo-1747021941314-4179268d6258?${PORTRAIT}`, offset: 18 },
  { src: `https://images.unsplash.com/photo-1758525861622-f4e7ac86a2d7?${PORTRAIT}`, offset: 40 },
  { src: `https://images.unsplash.com/photo-1744880034592-7c64776b2a85?${PORTRAIT}`, offset: 66 },
  { src: `https://images.unsplash.com/photo-1694175271713-a6e2cc378980?${PORTRAIT}`, offset: 100, rotate: "rotate-2" },
  { src: `https://images.unsplash.com/photo-1639436926668-2f8b4f32e15a?${PORTRAIT}`, offset: 146, rotate: "rotate-3" },
];

interface CommunityShowcaseProps {
  id?: string;
  eyebrow?: string;
  titleLead: string;
  titleTail: string;
  subtitle: string;
  ctaLabel: string;
  ctaTo: string;
  className?: string;
  /** draw the panel outline (default true) */
  bordered?: boolean;
}

const CARD_SIZE =
  "h-[96px] w-[70px] sm:h-[152px] sm:w-[108px] lg:h-[184px] lg:w-[132px]";

function AvatarCard({ avatar, index }: { avatar: Avatar; index: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-[20px] bg-surface-elevated shadow-elevated ring-1 ring-black/5 dark:ring-white/10 ${CARD_SIZE} ${
        avatar.rotate ?? ""
      }`}
      style={{ marginTop: avatar.offset }}
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-500/25 via-brand-500/10 to-accent-500/20 text-brand-500 dark:text-brand-300">
          <GraduationCap className="h-7 w-7 sm:h-9 sm:w-9" />
        </div>
      ) : (
        <img
          src={avatar.src}
          alt={`Edutu graduate ${index + 1}`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export default function CommunityShowcase({
  id,
  eyebrow = "Testimonials",
  titleLead,
  titleTail,
  subtitle,
  ctaLabel,
  ctaTo,
  className = "",
  bordered = true,
}: CommunityShowcaseProps) {
  const reduce = useReducedMotion();

  return (
    <section id={id} className={`px-4 py-16 sm:px-6 sm:py-20 ${className}`}>
      <div
        className={`relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-gradient-to-b from-surface-layer to-surface-body px-2 pb-14 shadow-elevated sm:px-6 sm:pb-20 ${
          bordered ? "border border-subtle" : ""
        }`}
      >
        {/* dashed vertical connector lines (behind everything) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          {[16, 33, 50, 67, 84].map((left) => (
            <span
              key={left}
              className="absolute top-8 bottom-24 border-l border-dashed border-subtle/50"
              style={{ left: `${left}%` }}
            />
          ))}
        </div>

        {/* ghost cards peeking from the very top */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-10 z-0 flex justify-center gap-2 opacity-30 sm:gap-3"
        >
          {Array.from({ length: 11 }).map((_, i) => (
            <div
              key={i}
              className={`shrink-0 rounded-[20px] bg-surface-elevated ${CARD_SIZE}`}
            />
          ))}
        </div>

        {/* arc of portrait cards */}
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 18 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex justify-center gap-2 pt-10 sm:gap-3"
        >
          {defaultAvatars.map((avatar, i) => (
            <AvatarCard key={avatar.src} avatar={avatar} index={i} />
          ))}
        </motion.div>

        {/* copy + CTA — pulled up into the arc's open centre */}
        <div className="relative z-20 mx-auto -mt-24 max-w-2xl px-6 text-center sm:-mt-28 lg:-mt-32">
          <span className="inline-flex items-center rounded-full border border-subtle bg-surface-layer px-3 py-1 text-xs font-semibold text-text-secondary shadow-soft">
            {eyebrow}
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold leading-[1.12] tracking-tight sm:text-3xl lg:text-4xl">
            <span className="block text-text-primary">{titleLead}</span>
            <span className="block text-text-muted">{titleTail}</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-text-secondary">
            {subtitle}
          </p>
          <Link
            to={ctaTo}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-text-primary px-7 py-3.5 text-sm font-bold text-surface-body no-underline shadow-elevated transition hover:-translate-y-0.5"
          >
            {ctaLabel} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
