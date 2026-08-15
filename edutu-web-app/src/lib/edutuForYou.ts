/**
 * Edutu For You — the impact program's single source of truth.
 *
 * Two consumers read this file: the landing-page band (`EdutuForYouBand`) and
 * the program page (`EdutuForYouPage`). Keeping copy, numbers and imagery here
 * means the homepage teaser can never quote a figure the page contradicts.
 *
 * Editing rules:
 *
 *   1. Every number on the page is either externally sourced (carry the source
 *      on the card) or one of ours already published on /impact. Do not invent
 *      a figure to fill a slot — cut the slot.
 *   2. Reach figures must stay in sync with `/impact`, which publishes the same
 *      "67k of 1M" progress. Change one, change both.
 *   3. Photo URLs are hotlinked (the convention established by AboutPage,
 *      CommunityPage and CommunityShowcase). Any new URL must be verified to
 *      return HTTP 200 before it lands — a wrong Unsplash ID fails silently as
 *      a broken image in production.
 */

import {
  Compass,
  Coins,
  FileText,
  Globe2,
  GraduationCap,
  HeartHandshake,
  Megaphone,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
 * Links
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * The community destination, reused from the mobile app's "Discussion" tile
 * (`edutumobile/app/(app)/opportunities/index.tsx`) so both platforms send
 * people to the same place.
 *
 * NOTE: this is a WhatsApp *channel* — broadcast-only, so followers receive
 * posts but cannot reply. CTA copy therefore says "Follow", not "Join the
 * conversation". If a group invite link replaces this, strengthen the copy in
 * `JOIN_CTA_LABEL` at the same time.
 */
export const WHATSAPP_JOIN_URL =
  "https://whatsapp.com/channel/0029VbCHBEVJJhzPcbBboP3y";

export const JOIN_CTA_LABEL = "Follow the community";

export const PARTNER_EMAIL = "my.edutu@gmail.com";

export const PARTNER_MAILTO = `mailto:${PARTNER_EMAIL}?subject=${encodeURIComponent(
  "Partnering with Edutu For You",
)}&body=${encodeURIComponent(
  "Hi Edutu team,\n\nI'd like to talk about partnering with Edutu For You.\n\nOrganisation:\nWhat we could bring (funding / distribution / opportunities / mentors):\n\n",
)}`;

export const PROGRAM_PATH = "/edutuforyou";

/* ────────────────────────────────────────────────────────────────────────────
 * Reach — kept identical to the figures published on /impact.
 * ──────────────────────────────────────────────────────────────────────────*/

export const REACH_GOAL = 1_000_000;
export const REACH_TODAY = 67_000;

/* ────────────────────────────────────────────────────────────────────────────
 * Imagery. Every URL below was verified to return HTTP 200.
 * ──────────────────────────────────────────────────────────────────────────*/

const PORTRAIT = "w=480&h=640&q=80&auto=format&fit=crop";

export const HERO_IMAGE =
  "https://images.unsplash.com/photo-1686213011624-8578b598ef0f?w=1920&h=1080&q=80&auto=format&fit=crop";

export const HERO_IMAGE_ALT =
  "A young graduate celebrating on her graduation day";

/** The offset mosaic on the landing band and the program hero. */
export interface MosaicImage {
  src: string;
  alt: string;
}

export const MOSAIC: MosaicImage[] = [
  {
    src: `https://images.unsplash.com/photo-1541339907198-e08756dedf3f?${PORTRAIT}`,
    alt: "Graduates throwing their caps in the air",
  },
  {
    src: `https://images.unsplash.com/photo-1778824717521-a23599f32d71?${PORTRAIT}`,
    alt: "A group of young people celebrating together",
  },
  {
    src: `https://images.unsplash.com/photo-1758525861622-f4e7ac86a2d7?${PORTRAIT}`,
    alt: "A scholar studying during a cohort session",
  },
  {
    src: `https://images.unsplash.com/photo-1744880034592-7c64776b2a85?${PORTRAIT}`,
    alt: "A mentor guiding an applicant through her next step",
  },
  {
    src: `https://images.unsplash.com/photo-1531123897727-8f129e1688ce?${PORTRAIT}`,
    alt: "A learner sharing a win with her community",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * The gap
 * ──────────────────────────────────────────────────────────────────────────*/

export interface GapStat {
  value: string;
  label: string;
  /** Shown verbatim on the card. Never leave this empty. */
  source: string;
  sourceHref?: string;
}

export const GAP_STATS: GapStat[] = [
  {
    value: "~70%",
    label: "of sub-Saharan Africa is under 30",
    source: "UN DESA, World Population Prospects",
    sourceHref: "https://www.un.org/ohrlls/locked-out",
  },
  {
    value: "67,000",
    label: "young people reached by Edutu",
    source: "Edutu platform data",
  },
  {
    value: "31 of 54",
    label: "African countries with Edutu activity",
    source: "Edutu platform data",
  },
];

export const GAP_THESIS =
  "Ability is not the bottleneck. People miss opportunities because the information arrives late — or not at all.";

/* ────────────────────────────────────────────────────────────────────────────
 * The aim
 * ──────────────────────────────────────────────────────────────────────────*/

export interface Milestone {
  phase: string;
  reach: string;
  horizon: string;
  body: string;
  /** True for the phase we are currently inside. */
  current?: boolean;
}

export const MILESTONES: Milestone[] = [
  {
    phase: "Where we are",
    reach: "67,000",
    horizon: "Today",
    body: "Reached across 31 African countries, with a live opportunity catalogue updated every day.",
    current: true,
  },
  {
    phase: "Phase one — Deepen",
    reach: "150,000",
    horizon: "2026",
    body: "Go deeper in the countries we already serve, in the languages people actually think in.",
  },
  {
    phase: "Phase two — Widen",
    reach: "500,000",
    horizon: "2028",
    body: "All 54 countries, with distribution partners reaching the young people no app reaches alone.",
  },
  {
    phase: "Phase three — Reach",
    reach: "1,000,000",
    horizon: "2030",
    body: "One million young people who found a global opportunity because the information finally came to them.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * The learner journey
 * ──────────────────────────────────────────────────────────────────────────*/

export interface ProgramTimelineStage {
  period: string;
  title: string;
  body: string;
}

export const PROGRAM_TIMELINE: ProgramTimelineStage[] = [
  {
    period: "Month 1",
    title: "Find your first real matches",
    body: "Build a profile around your country, level, field, and goals so the right opportunities can find you.",
  },
  {
    period: "Months 2–3",
    title: "Build your application kit",
    body: "Turn your experience into a CV, personal statement, and plan you can actually submit.",
  },
  {
    period: "Months 4–6",
    title: "Submit before the window closes",
    body: "Move from saved opportunity to finished application with clear next steps and deadline support.",
  },
  {
    period: "Months 7–9",
    title: "Keep going with people",
    body: "Use coaching, mentors, and community feedback to strengthen the next attempt after every response.",
  },
  {
    period: "Months 10–12",
    title: "Carry the door forward",
    body: "Track what changed, celebrate the outcome, and help someone else find the opportunity sooner.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Pillars
 * ──────────────────────────────────────────────────────────────────────────*/

export interface Pillar {
  icon: LucideIcon;
  title: string;
  /** Written to a partner: what the mechanism is. */
  body: string;
  /** Written to a beneficiary: what you get. */
  youGet: string;
  image: string;
  imageAlt: string;
  ctaLabel: string;
  ctaPath: string;
}

export const PILLARS: Pillar[] = [
  {
    icon: Compass,
    title: "AI matching, in local context",
    body: "Find openings that fit your country, field, level, and deadline.",
    youGet:
      "A shortlist of opportunities you can genuinely win, instead of a feed of ones you can't.",
    image: `https://images.unsplash.com/photo-1694175271713-a6e2cc378980?${PORTRAIT}`,
    imageAlt: "A learner searching for opportunities on her phone",
    ctaLabel: "Find my matches",
    ctaPath: "/signup",
  },
  {
    icon: FileText,
    title: "Application coaching",
    body: "Turn your experience into a clearer CV, essay, and interview plan.",
    youGet:
      "Help turning what you've done into an application that reads the way funders expect.",
    image: `https://images.unsplash.com/photo-1620829813629-45478205c88f?${PORTRAIT}`,
    imageAlt: "A student drafting an application essay",
    ctaLabel: "Build my application",
    ctaPath: "/signup",
  },
  {
    icon: Users,
    title: "Community and mentorship",
    body: "Get feedback and encouragement from people a step ahead.",
    youGet:
      "People a year ahead of you who have already been through the exact thing you're attempting.",
    image: `https://images.unsplash.com/photo-1565490129165-bd6a24996c25?${PORTRAIT}`,
    imageAlt: "A peer cohort working together",
    ctaLabel: "Meet the community",
    ctaPath: "/community",
  },
  {
    icon: Globe2,
    title: "Access to global opportunities",
    body: "See global opportunities without gatekeepers or agent fees.",
    youGet:
      "The world's opportunities, on the same terms as everyone else applying for them.",
    image: `https://images.unsplash.com/photo-1628825453863-ccfe2dcc4c70?${PORTRAIT}`,
    imageAlt: "Two young women standing together",
    ctaLabel: "Browse opportunities",
    ctaPath: "/opportunities",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Partnership
 * ──────────────────────────────────────────────────────────────────────────*/

export interface PartnerLane {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const PARTNER_LANES: PartnerLane[] = [
  {
    icon: Coins,
    title: "Funding partners",
    body: "Underwrite a cohort. You fund access and coaching for a named group of young people, and you see exactly what came of it.",
  },
  {
    icon: Megaphone,
    title: "Distribution partners",
    body: "NGOs, schools and youth organisations who already have the trust and the reach we don't. You bring the young people; we bring the infrastructure.",
  },
  {
    icon: GraduationCap,
    title: "Opportunity partners",
    body: "Universities and foundations who want their programs in front of qualified applicants who currently never see them. Your listing, their shortlist.",
  },
  {
    icon: HeartHandshake,
    title: "Mentor partners",
    body: "Companies whose people can give hours instead of money. An hour a month from someone who has done it is worth more than most grants.",
  },
];

export const PARTNER_PITCH =
  "The infrastructure already exists. What the next million needs is funding, distribution and opportunities.";

/* ────────────────────────────────────────────────────────────────────────────
 * Joining
 * ──────────────────────────────────────────────────────────────────────────*/

export interface JoinStep {
  step: string;
  title: string;
  body: string;
}

export const JOIN_STEPS: JoinStep[] = [
  {
    step: "01",
    title: "Follow the community",
    body: "Opportunities, deadlines and application guidance land where you already are. No fee, no application to join.",
  },
  {
    step: "02",
    title: "Create your Edutu profile",
    body: "Ten minutes of questions is what turns a generic feed into a shortlist that fits your country, your level and your field.",
  },
  {
    step: "03",
    title: "Apply to your first real match",
    body: "Pick one. Build the kit with the coach. Submit it before the deadline — and then do it again.",
  },
];

export const JOIN_ELIGIBILITY =
  "For young people across Africa who are ready for more, but have not always had the information or support to get there.";

/* ────────────────────────────────────────────────────────────────────────────
 * FAQ — including the two uncomfortable questions.
 * ──────────────────────────────────────────────────────────────────────────*/

export interface ProgramFaq {
  question: string;
  answer: string;
}

export const PROGRAM_FAQ: ProgramFaq[] = [
  {
    question: "Is it free?",
    answer:
      "Following the community and creating an Edutu profile costs nothing, and the opportunities we surface are ones you apply to directly — we never take a fee from you or from the funder. Edutu also sells a paid Pro tier, and that revenue is part of what keeps the free tier running.",
  },
  {
    question: "Are the stories on this page real people?",
    answer:
      "No, and we label them as composites where they appear. They are drawn from our user research and describe the situations we consistently see. When we have alumni outcomes we can verify and publish with consent, we will replace them with the real thing.",
  },
  {
    question: "Who counts toward the one million?",
    answer:
      "A young person who engaged with Edutu — the platform, the community or a partner programme. It is the same definition and the same running total we publish on our impact page, not a separate number invented for this program.",
  },
  {
    question: "How do you keep scam opportunities out?",
    answer:
      "Every listing is checked for the patterns that define opportunity fraud: application fees, payment requests, harvested phone numbers, dead links and deadlines that have already passed. The whole point is useless if what we surface cannot be trusted.",
  },
  {
    question: "I'm an organisation. What do you actually need?",
    answer:
      "Funding for cohorts, distribution into communities we cannot reach alone, opportunities to list, and mentors. Email us and say which one you're offering — that is genuinely the whole process.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Shared copy
 * ──────────────────────────────────────────────────────────────────────────*/

export const PROGRAM_NAME = "Edutu For You";
export const PROGRAM_KICKER = "An Edutu impact program";
export const PROGRAM_HEADLINE = "The door should not be harder to find than the dream.";
export const PROGRAM_SUBHEAD =
  "Edutu helps capable young people find the right opportunity, prepare a stronger application, and keep going.";

export const HERO_PRIMARY_LABEL = "Help open the next door";
export const HERO_SECONDARY_LABEL = "Find my opportunities";

export const NARRATIVE_BEAT = {
  label: "Illustrative scholarship journey",
  title: "One scholarship can change how you see the next door.",
  body:
    "A composite story about finding Mastercard, surviving the application, and realising Chevening is not reserved for people with a secret map.",
  slides: [
    {
      eyebrow: "01 / Find the door",
      title: "The Mastercard opportunity was real. Finding it was the first hurdle.",
      body:
        "Zainab had the grades and the ambition, but no reliable way to know which scholarship matched her. A community message finally put the Mastercard Foundation Scholars Program in front of her before the deadline.",
      tag: "Mastercard Foundation Scholars Program",
    },
    {
      eyebrow: "02 / Make the case",
      title: "The application asked for a story nobody had taught her to tell.",
      body:
        "Her experience was strong. Her first draft hid it behind generic language. With a clear prompt, a deadline, and someone to review the shape of the answer, she turned what she had lived into evidence of leadership.",
      tag: "Application coaching",
    },
    {
      eyebrow: "03 / Get the yes",
      title: "The scholarship was not a miracle. It was a prepared application on time.",
      body:
        "Zainab earned a place in the Mastercard Foundation Scholars Program. The result mattered, but so did the repeatable process: find the right door, understand the question, and submit before it closes.",
      tag: "A supported submission",
    },
    {
      eyebrow: "04 / Keep going",
      title: "Chevening became a next step, not a secret world.",
      body:
        "Once the language of scholarships stopped feeling hidden, the next opportunity became easier to recognise. Chevening was still competitive — just no longer invisible or impossible to imagine.",
      tag: "Chevening and the next door",
    },
  ],
};

/** The homepage band's shorter framing. */
export const BAND_BODY =
  "Somewhere right now, a capable young person is ready for an opportunity they may never hear about. Edutu For You helps close that gap.";
