export type SeoCategory = {
  slug: string;
  canonicalCategory: string;
  label: string;
  title: string;
  description: string;
  introduction: string;
  aliases: string[];
  keywords?: RegExp;
  faqs: Array<{ question: string; answer: string }>;
};

export const SEO_CATEGORIES: SeoCategory[] = [
  {
    slug: "scholarships",
    canonicalCategory: "scholarships",
    label: "Scholarships",
    title: "Scholarships for African and global students | Edutu",
    description:
      "Browse verified undergraduate, postgraduate and fully funded scholarships with deadlines, eligibility, benefits and official application sources.",
    introduction:
      "Discover scholarship opportunities for undergraduate, postgraduate and doctoral study. Edutu organises the important facts so you can check eligibility and prepare before the deadline.",
    aliases: ["scholarship", "scholarships", "bursaries", "studentships"],
    faqs: [
      {
        question: "How often are Edutu scholarship listings checked?",
        answer:
          "Edutu records source and update information when available and links applicants to the official provider for final confirmation.",
      },
      {
        question: "Does Edutu award the scholarships?",
        answer:
          "No. Edutu supports discovery and understanding; the named provider controls the award and application process.",
      },
    ],
  },
  {
    slug: "internships",
    canonicalCategory: "internships",
    label: "Internships",
    title: "Internships and graduate trainee opportunities | Edutu",
    description:
      "Find verified internships, apprenticeships and graduate trainee roles with locations, deadlines, requirements and official application links.",
    introduction:
      "Explore practical work-experience opportunities for students, recent graduates and early-career professionals.",
    aliases: ["internship", "internships", "trainee", "apprenticeships"],
    faqs: [
      {
        question: "Are all internships on Edutu paid?",
        answer:
          "Not necessarily. Compensation is shown only when the source provides it, so confirm the final terms on the official page.",
      },
      {
        question: "Can international applicants use these listings?",
        answer:
          "Eligibility differs by provider. Review the country, location and eligibility information before applying.",
      },
    ],
  },
  {
    slug: "fellowships",
    canonicalCategory: "fellowships",
    label: "Fellowships",
    title: "Fellowships, residencies and leadership cohorts | Edutu",
    description:
      "Explore verified fellowships, residencies and leadership cohorts with benefits, selection requirements, deadlines and source links.",
    introduction:
      "Find fellowships and residencies supporting leadership, research, public service, creative work and professional development.",
    aliases: ["fellowship", "fellowships", "residency", "residencies"],
    faqs: [
      {
        question: "What is the difference between a fellowship and a scholarship?",
        answer:
          "Scholarships usually fund formal study, while fellowships often support research, leadership or professional development.",
      },
      {
        question: "What should I prepare for a fellowship application?",
        answer:
          "Common requirements include a CV, personal statement, proposal, references and evidence of impact, subject to the provider rules.",
      },
    ],
  },
  {
    slug: "grants",
    canonicalCategory: "grants",
    label: "Grants",
    title: "Grants and funding opportunities | Edutu",
    description:
      "Discover verified grants, seed funding and project support with funding details, eligibility, deadlines and official source links.",
    introduction:
      "Explore grants for research, community projects, startups, creative work and social impact.",
    aliases: ["grant", "grants", "microgrants", "funding"],
    faqs: [
      {
        question: "Does a grant have to be repaid?",
        answer:
          "Most grants are non-repayable when recipients follow the terms, but every programme has its own conditions and reporting requirements.",
      },
      {
        question: "How can I assess whether a grant is legitimate?",
        answer:
          "Check the official provider domain, programme history, published terms and contact details before sharing personal information.",
      },
    ],
  },
  {
    slug: "graduate-programs",
    canonicalCategory: "graduate_programs",
    label: "Graduate programs",
    title: "Graduate programs, master's and PhD opportunities | Edutu",
    description:
      "Find graduate degree, master's, MBA and PhD opportunities with admission requirements, funding information, deadlines and official sources.",
    introduction:
      "Browse postgraduate study and graduate-school opportunities, including master's, doctoral and professional degree programmes.",
    aliases: [
      "graduate-programs",
      "graduate_programs",
      "graduate-program",
      "postgraduate",
      "masters",
      "phd",
    ],
    faqs: [
      {
        question: "Are graduate programmes on Edutu fully funded?",
        answer:
          "Some are fully funded, some provide partial support and others are admission opportunities only.",
      },
      {
        question: "Should I contact a supervisor before applying?",
        answer:
          "That depends on the institution. Follow the official department guidance for the programme.",
      },
    ],
  },
  {
    slug: "bootcamps",
    canonicalCategory: "bootcamps",
    label: "Bootcamps",
    title: "Bootcamps, accelerators and intensive training | Edutu",
    description:
      "Explore verified bootcamps, accelerators and cohort-based training with skills, eligibility, costs or funding, deadlines and application links.",
    introduction:
      "Find intensive learning and acceleration programmes designed to build practical skills or support early-stage ventures.",
    aliases: ["bootcamp", "bootcamps", "accelerator", "accelerators"],
    faqs: [
      {
        question: "Are Edutu bootcamp listings free?",
        answer:
          "Some are free or funded and others charge fees. Confirm the total cost on the official provider page.",
      },
      {
        question: "How do I choose a credible bootcamp?",
        answer:
          "Review the curriculum, instructors, delivery format, alumni outcomes, total cost and refund terms.",
      },
    ],
  },
  {
    slug: "programs",
    canonicalCategory: "programs",
    label: "Programs",
    title: "Leadership, exchange and development programs | Edutu",
    description:
      "Browse verified leadership, exchange, mentorship and professional development programs with eligibility, benefits and deadlines.",
    introduction:
      "Explore structured programmes providing training, mentorship, networks, exchange experiences and professional development.",
    aliases: ["program", "programs", "programme", "programmes"],
    faqs: [
      {
        question: "What kinds of programmes appear here?",
        answer:
          "This collection includes leadership, mentorship, exchange and professional development opportunities without a more specific category.",
      },
      {
        question: "How do I confirm programme dates?",
        answer:
          "Use the official source because providers may update deadlines, cohort dates or delivery arrangements.",
      },
    ],
  },
  {
    slug: "competitions",
    canonicalCategory: "programs",
    label: "Competitions",
    title: "Competitions, challenges and innovation awards | Edutu",
    description:
      "Find verified competitions, innovation challenges, contests and hackathons with prizes, eligibility, deadlines and official entry links.",
    introduction:
      "Discover competitions and challenges for ideas, research, entrepreneurship, technology, writing, design and social impact.",
    aliases: ["competition", "competitions", "challenge", "challenges", "contest", "hackathon"],
    keywords: /\b(competition|contest|challenge|hackathon|prize|award)\b/i,
    faqs: [
      {
        question: "Are all competitions on Edutu free to enter?",
        answer:
          "No. Check the official terms for fees, intellectual-property rules, judging criteria and prize restrictions.",
      },
      {
        question: "What should I check before entering a competition?",
        answer:
          "Confirm eligibility, submission format, judging criteria, ownership terms and the deadline timezone.",
      },
    ],
  },
  {
    slug: "events",
    canonicalCategory: "events",
    label: "Opportunity events",
    title: "Conferences, summits, workshops and opportunity events | Edutu",
    description:
      "Discover verified conferences, summits, workshops and webinars with audience details, dates, locations and registration sources.",
    introduction:
      "Explore conferences, workshops, webinars, summits and forums offering learning, networking or application opportunities.",
    aliases: ["event", "events", "conference", "summit", "workshop", "webinar"],
    faqs: [
      {
        question: "Are these the same as Edutu-hosted events?",
        answer:
          "Not always. This category may include third-party events; Edutu-hosted sessions are also available from the events page.",
      },
      {
        question: "How do I confirm whether an event is online?",
        answer:
          "Review the location information, then confirm the current format on the official registration page.",
      },
    ],
  },
];

export const STATIC_INDEXABLE_PATHS = [
  "/",
  "/opportunities",
  "/blog",
  "/events",
  "/about",
  "/impact",
  "/community",
  "/what-we-believe",
  "/edutuforyou",
  "/whats-new",
  "/careers",
  "/help",
  "/privacy",
  "/terms",
  "/download",
  "/developers",
  "/scholarship-engine",
];

export function findSeoCategory(value?: string): SeoCategory | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!normalized) return null;

  return (
    SEO_CATEGORIES.find(
      (category) =>
        category.slug === normalized ||
        category.aliases.some(
          (alias) => alias.toLowerCase().replace(/_/g, "-") === normalized,
        ),
    ) ?? null
  );
}
