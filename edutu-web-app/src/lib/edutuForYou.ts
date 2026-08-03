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
  Sparkles,
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
  "https://images.pexels.com/photos/8199562/pexels-photo-8199562.jpeg?auto=compress&cs=tinysrgb&w=1920";

export const HERO_IMAGE_ALT =
  "A young African student working through her studies";

/** The offset mosaic on the landing band and the program hero. */
export interface MosaicImage {
  src: string;
  alt: string;
}

export const MOSAIC: MosaicImage[] = [
  {
    src: `https://images.unsplash.com/photo-1686213011624-8578b598ef0f?${PORTRAIT}`,
    alt: "A graduate celebrating on her graduation day",
  },
  {
    src: `https://images.unsplash.com/photo-1620829813573-7c9e1877706f?${PORTRAIT}`,
    alt: "A student working through an application on a laptop",
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
}

export const GAP_STATS: GapStat[] = [
  {
    value: "~70%",
    label: "of sub-Saharan Africa is under 30 — the youngest population on earth",
    source: "UN DESA, World Population Prospects",
  },
  {
    value: "1 in 3",
    label: "young Africans is unemployed or in vulnerable work",
    source: "African Development Bank",
  },
  {
    value: "67,000",
    label: "young people Edutu has reached so far",
    source: "Edutu platform data",
  },
  {
    value: "31 of 54",
    label: "African countries where Edutu is already active",
    source: "Edutu platform data",
  },
];

export const GAP_THESIS =
  "None of these numbers describe a shortage of ability. They describe a shortage of information. The scholarship exists, the fellowship is open, the grant is unclaimed — and the person who should have applied never heard about it until the deadline had passed.";

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
}

export const PILLARS: Pillar[] = [
  {
    icon: Compass,
    title: "AI matching, in local context",
    body: "Our engine reads thousands of scholarships, fellowships, grants and programs, then filters them down to what one specific person is actually eligible for — by country, level, field and deadline. Mobile-first and built for low bandwidth.",
    youGet:
      "A shortlist of opportunities you can genuinely win, instead of a feed of ones you can't.",
    image: `https://images.unsplash.com/photo-1694175271713-a6e2cc378980?${PORTRAIT}`,
    imageAlt: "A learner searching for opportunities on her phone",
  },
  {
    icon: FileText,
    title: "Application coaching",
    body: "CV tailoring, essay structure, interview preparation — the work that normally requires a paid consultant, delivered by an AI coach that has read what the funder is actually asking for.",
    youGet:
      "Help turning what you've done into an application that reads the way funders expect.",
    image: `https://images.unsplash.com/photo-1620829813629-45478205c88f?${PORTRAIT}`,
    imageAlt: "A student drafting an application essay",
  },
  {
    icon: Users,
    title: "Community and mentorship",
    body: "Peer cohorts and mentor access around the AI. Applying is lonely and rejection is the norm; the people who keep going are the ones who aren't doing it alone.",
    youGet:
      "People a year ahead of you who have already been through the exact thing you're attempting.",
    image: `https://images.unsplash.com/photo-1565490129165-bd6a24996c25?${PORTRAIT}`,
    imageAlt: "A peer cohort working together",
  },
  {
    icon: Globe2,
    title: "Access to global opportunities",
    body: "No gatekeepers, no agent fees, no dependence on knowing the right person. The same information a well-connected applicant has, delivered to someone who has none of those advantages.",
    youGet:
      "The world's opportunities, on the same terms as everyone else applying for them.",
    image: `https://images.unsplash.com/photo-1628825453863-ccfe2dcc4c70?${PORTRAIT}`,
    imageAlt: "A young person looking out toward what comes next",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Stories
 *
 * These are composites drawn from user research — NOT alumni. Every card
 * renders `COMPOSITE_LABEL`, and the section renders `COMPOSITE_DISCLOSURE`
 * above them. Both are load-bearing: an unlabelled fictional testimonial on an
 * impact page is the fastest way to lose a funder's trust. Do not remove them,
 * and do not reuse the names published as real testimonials on /impact
 * (Amara, David, Zainab, Kwame).
 * ──────────────────────────────────────────────────────────────────────────*/

export const COMPOSITE_LABEL = "Illustrative composite";

export const COMPOSITE_DISCLOSURE =
  "The three people below are composites, drawn from our user research. They portray who Edutu For You is built for — not alumni we have already served. We would rather show you the problem honestly than borrow someone else's success story.";

export interface Story {
  name: string;
  age: number;
  place: string;
  image: string;
  imageAlt: string;
  quote: string;
  /** The two-line teaser shown before expanding. */
  teaser: string;
  /** Paragraphs revealed by "Read more". */
  full: string[];
  /** The one sentence that names the barrier. */
  barrier: string;
}

export const STORIES: Story[] = [
  {
    name: "Aisha",
    age: 19,
    place: "Kano, Nigeria",
    image: `https://images.unsplash.com/photo-1541339907198-e08756dedf3f?${PORTRAIT}`,
    imageAlt: "A young woman studying on her phone",
    quote:
      "I could write the code. I could not write the paragraph about myself.",
    teaser:
      "She taught herself Python on a phone with a cracked screen, working through tutorials between her shifts at her mother's shop.",
    full: [
      "Aisha taught herself Python on a phone with a cracked screen, working through tutorials between shifts at her mother's shop. By nineteen she had built three small apps, one of which the shop still runs on.",
      "What she had never done was write about herself. The fully-funded fellowship she eventually applied to had been open for two years before she heard it existed, and when she found it, the application asked for a CV, a personal statement and two references — a genre of writing nobody had ever taught her.",
      "The technical ability was never the gap. The gap was a document, a deadline, and the fact that nobody in her circle had ever filled one of these in before.",
    ],
    barrier:
      "The barrier was never the coursework. It was a CV she had no idea how to write.",
  },
  {
    name: "Kofi",
    age: 23,
    place: "Kumasi, Ghana",
    image: `https://images.unsplash.com/photo-1620829813573-7c9e1877706f?${PORTRAIT}`,
    imageAlt: "A graduate working at a laptop",
    quote: "I applied to forty things. I should have applied to four.",
    teaser:
      "He graduated top of his class into three years of 'we regret to inform you'. The volume was never the problem.",
    full: [
      "Kofi graduated top of his class and then spent three years collecting rejections. He was not lazy about it — he applied to more than forty programs, some of them twice.",
      "Almost none of them were a fit. He was applying to opportunities that wanted five years of experience, or a different passport, or a research background he did not have, because there was no way to tell from the listing which was which. Every rejection cost him two evenings and a little more belief.",
      "The four that genuinely matched his profile were buried somewhere in the same feed. He never found them, because nothing was doing the filtering except him.",
    ],
    barrier:
      "His problem was applying to the wrong forty things instead of the right four.",
  },
  {
    name: "Halima",
    age: 17,
    place: "Kakuma, Kenya",
    image: `https://images.unsplash.com/photo-1747021941314-4179268d6258?${PORTRAIT}`,
    imageAlt: "A student reading in a community learning space",
    quote: "Everything I do online, I do on someone else's data bundle.",
    teaser:
      "She lives in a refugee settlement and shares a data bundle with four other people. For her, low-bandwidth access is not a feature.",
    full: [
      "Halima is seventeen, lives in a refugee settlement, and shares a data bundle with four other people. Her study time is measured in megabytes.",
      "Most scholarship portals are built by people who have never had to think about this. A page that loads six megabytes of hero video costs her a week of browsing. A form that times out and loses her answers costs her the whole attempt.",
      "For her, the promise of an opportunity platform is not the AI. It is that the thing loads at all, in a language she reads, on the phone she actually has, without spending the bundle before she reaches the apply button.",
    ],
    barrier:
      "For Halima, low-bandwidth mobile access is not a feature of the product. It is the product.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * A year in the program
 * ──────────────────────────────────────────────────────────────────────────*/

export interface TimelineStep {
  window: string;
  title: string;
  body: string;
}

export const TIMELINE: TimelineStep[] = [
  {
    window: "Month 1",
    title: "Profile and first matches",
    body: "You tell us where you are, what you've done and what you're aiming at. You get your first real shortlist within the week.",
  },
  {
    window: "Months 2–3",
    title: "Your first application kit",
    body: "A CV that reads properly, a personal statement in your own voice, and a clear picture of what one specific funder is asking for.",
  },
  {
    window: "Months 4–6",
    title: "First submissions",
    body: "You apply — to a handful of things you can genuinely win, with deadlines tracked so none of them pass you quietly.",
  },
  {
    window: "Months 7–9",
    title: "Mentorship and iteration",
    body: "Some of it comes back as no. You work with a mentor and the coach on what to change, and you go again with better material.",
  },
  {
    window: "Months 10–12",
    title: "Outcomes, and paying it forward",
    body: "An offer, an admission, a grant or a role — and a cohort behind you asking you exactly what you asked a year ago.",
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
  "Edutu already runs the infrastructure — the opportunity catalogue, the matching engine, the coach, the deadline tracking, the scam filtering. What it takes to reach the next million is not a new platform. It is funding, distribution and opportunities from people who want the same thing.";

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
  "Edutu For You is for young people across Africa who have the ability and not the access — no cost, no gatekeeping, no connections required. If you are reading this and that describes you, you already qualify.";

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
export const PROGRAM_HEADLINE = "Talent is everywhere. Access isn't.";
export const PROGRAM_SUBHEAD =
  "Edutu For You is our commitment to reach one million underprivileged young people with access to global opportunities — using the AI infrastructure we have already built.";

/** The homepage band's shorter framing. */
export const BAND_BODY =
  "Somewhere right now a nineteen-year-old is qualified for a fully-funded scholarship she will never hear about. Edutu For You exists to close that gap one million times.";

export const SPARKLE_ICON = Sparkles;
