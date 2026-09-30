/** Shared facts and destinations for the impact page and homepage band. */

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
export const PROGRAM_NAME = "Edutu For You";
export const PROGRAM_KICKER = "An Edutu impact program";
export const PROGRAM_HEADLINE = "One million young people. One open door.";
export const BAND_BODY =
  "Somewhere right now, a capable young person is ready for an opportunity they may never hear about. Edutu For You helps close that gap.";

// These are the same reach figures published on /impact. Update both surfaces together.
export const REACH_GOAL = 1_000_000;
export const REACH_TODAY = 67_000;

export interface GapStat {
  value: string;
  label: string;
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

export interface ProgramPillar {
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  ctaLabel: string;
  ctaPath: string;
}

export const PILLARS: ProgramPillar[] = [
  {
    title: "AI matching, in local context",
    body: "Find openings that fit your country, field, level, and deadline.",
    image: "/illustrations/feature-opportunity-matching.png",
    imageAlt: "Illustrated compass and path to an opportunity",
    ctaLabel: "Find my matches",
    ctaPath: "/signup",
  },
  {
    title: "Application coaching",
    body: "Turn your experience into a clearer CV, essay, and interview plan.",
    image: "/illustrations/feature-application-tracking.png",
    imageAlt: "Illustrated checklist leading toward a goal",
    ctaLabel: "Build my application",
    ctaPath: "/signup",
  },
  {
    title: "Community and mentorship",
    body: "Get feedback and encouragement from people a step ahead.",
    image: "/community/study-support.jpg",
    imageAlt: "Learners supporting one another",
    ctaLabel: "Meet the community",
    ctaPath: "/community",
  },
];

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
