/**
 * Edutu For You — the nine beneficiary stories.
 *
 * Split out of `edutuForYou.ts` because the long-form chapters dwarf every
 * other piece of program copy and would bury it.
 *
 * HONESTY CONTRACT — read before editing:
 *
 * These are composites drawn from user research, paired with stock portraits
 * of people who have never used Edutu. They are written at full length and in
 * specific detail because the situations are real; the individuals are not.
 *
 * `STORY_ATTRIBUTION` therefore renders once under the section heading on the
 * program page and once at the foot of every story page. It is deliberately
 * quiet rather than a badge on every card — but it is not optional. Publishing
 * these as verified alumni testimonials would be a fabricated endorsement, and
 * the cost of that being noticed is far higher than the copy is worth.
 *
 * When real, consented alumni stories exist, replace these wholesale and drop
 * the attribution line with them.
 *
 * Every image URL below was verified to return HTTP 200, and no portrait is
 * reused anywhere else in the program pages.
 */

const PORTRAIT = "w=600&h=800&q=80&auto=format&fit=crop";
const WIDE = "w=1600&h=900&q=80&auto=format&fit=crop";

export const STORY_ATTRIBUTION =
  "Composite stories drawn from our user research, illustrated with stock photography. They describe situations we see repeatedly — not individuals we have served.";

export interface StoryChapter {
  heading: string;
  body: string[];
}

export interface StoryStat {
  value: string;
  label: string;
}

export interface Story {
  slug: string;
  name: string;
  age: number;
  place: string;
  /** One-line outcome, used as the card's eyebrow. */
  outcome: string;
  portrait: string;
  portraitAlt: string;
  heroImage: string;
  heroAlt: string;
  quote: string;
  /** Single-line hook on the card. Keep it to one sentence. */
  teaser: string;
  /** The long read. */
  chapters: StoryChapter[];
  stats: StoryStat[];
  /** Closing pull-out: the one sentence that names the barrier. */
  barrier: string;
  /**
   * True when the story is an illustrative composite rather than a real,
   * consented user. Drives the attribution line on the card list and the story
   * page. Admin-editable per story — see the impact_stories migration.
   */
  isComposite: boolean;
}

/** Seed rows. Every one is a composite, so `isComposite` is applied below
 * rather than repeated nine times. */
const SEED: Omit<Story, "isComposite">[] = [
  {
    slug: "aisha-kano",
    name: "Aisha",
    age: 19,
    place: "Kano, Nigeria",
    outcome: "Fully-funded fellowship",
    portrait: `https://images.unsplash.com/photo-1770235621081-030607a06cee?${PORTRAIT}`,
    portraitAlt: "A young woman studying at her desk with an open book",
    heroImage: `https://images.unsplash.com/photo-1516182823370-7a5fa91445c3?${WIDE}`,
    heroAlt: "A young woman writing in a notebook outdoors",
    quote: "I could write the code. I could not write the paragraph about myself.",
    teaser:
      "She taught herself Python on a phone with a cracked screen. The barrier was never the coursework.",
    chapters: [
      {
        heading: "Three apps, one cracked screen",
        body: [
          "Aisha learned to code in fifteen-minute pieces, between customers at her mother's shop in Kano. The phone she learned on had a crack running corner to corner; she got used to reading around it. By nineteen she had built three small apps, and the shop still runs its stock count on one of them.",
          "Nobody around her wrote software. There was no teacher to ask, no cohort to compare herself against, and no way to know whether what she was building was any good. She assumed it was not, because the only benchmark she had was the polished work of strangers on the internet.",
        ],
      },
      {
        heading: "The fellowship that had been open for two years",
        body: [
          "The fellowship she eventually applied to had existed for two years before she heard of it. It was fully funded, it was open to exactly her profile, and it had already run twice without a single applicant from her state.",
          "It had not been hidden. It was on a website, in English, behind three clicks — and there was simply no mechanism by which the information would ever have reached her. Discovery was the whole gap.",
        ],
      },
      {
        heading: "A genre of writing nobody teaches",
        body: [
          "When she found it, the application asked for a CV, a personal statement and two references. She had never written any of the three, and neither had anyone she could ask.",
          "This is the part people underestimate. Aisha could do the technical work the fellowship existed to fund. What stopped her for six weeks was a one-page document about herself, written in a register she had never been taught, for readers whose expectations nobody had ever described to her.",
          "The coaching did not write it for her. It told her what the funder was actually asking for underneath the question, and what a strong answer looked like — the thing a well-connected applicant gets for free from a parent, a teacher or a friend who has done it before.",
        ],
      },
    ],
    stats: [
      { value: "2 years", label: "the fellowship was open before she heard of it" },
      { value: "6 weeks", label: "stalled on the personal statement, not the work" },
      { value: "3", label: "apps built before she believed she was a developer" },
    ],
    barrier:
      "The barrier was never the coursework. It was a CV she had no idea how to write.",
  },
  {
    slug: "kofi-kumasi",
    name: "Kofi",
    age: 23,
    place: "Kumasi, Ghana",
    outcome: "Global cohort place",
    portrait: `https://images.unsplash.com/photo-1620829813573-7c9e1877706f?${PORTRAIT}`,
    portraitAlt: "A young man working at a laptop",
    heroImage: `https://images.unsplash.com/photo-1593910409015-59ae3c6aff04?${WIDE}`,
    heroAlt: "A young man working at a laptop in low light",
    quote: "I applied to forty things. I should have applied to four.",
    teaser:
      "He graduated top of his class into three years of rejection. The volume was never the problem.",
    chapters: [
      {
        heading: "Forty applications, three years",
        body: [
          "Kofi finished top of his cohort and then spent three years collecting rejections. He was not casual about it — he applied to more than forty programmes, several of them twice, and kept a spreadsheet.",
          "The spreadsheet is the detail that stays with you. He was organised, he was persistent, and he was pointed almost entirely at the wrong targets.",
        ],
      },
      {
        heading: "Nothing was doing the filtering",
        body: [
          "Most of what he applied to wanted five years of experience, or a different passport, or a research background he did not have. None of the listings said so in a way you could act on. Eligibility was buried in a PDF, or implied, or simply assumed.",
          "So the filtering fell to him — and filtering forty opportunities properly is a research project, not an evening. Each mis-aimed application cost him two evenings and a little more belief that the problem was him.",
        ],
      },
      {
        heading: "The four that fit",
        body: [
          "There were four programmes in that same feed he was genuinely competitive for. He never found them.",
          "What changed was not effort. It was that something else took on the eligibility read — country, level, field, deadline — and handed him a short list he could take seriously. He applied to four things that year instead of forty, and prepared properly for each.",
          "Rejection did not stop. It just stopped being random.",
        ],
      },
    ],
    stats: [
      { value: "40+", label: "applications sent over three years" },
      { value: "4", label: "he was actually eligible for" },
      { value: "0", label: "listings that stated eligibility plainly" },
    ],
    barrier:
      "His problem was applying to the wrong forty things instead of the right four.",
  },
  {
    slug: "halima-kakuma",
    name: "Halima",
    age: 17,
    place: "Kakuma, Kenya",
    outcome: "Secondary scholarship",
    portrait: `https://images.unsplash.com/photo-1747021941314-4179268d6258?${PORTRAIT}`,
    portraitAlt: "A young student outdoors, looking at the camera",
    heroImage: `https://images.unsplash.com/photo-1648301033733-44554c74ec50?${WIDE}`,
    heroAlt: "Students working together at a classroom desk",
    quote: "Everything I do online, I do on someone else's data bundle.",
    teaser:
      "She shares a data bundle with four other people. Her study time is measured in megabytes.",
    chapters: [
      {
        heading: "Study time measured in megabytes",
        body: [
          "Halima is seventeen, lives in a refugee settlement, and shares a data bundle with four other people. Her available study time is not measured in hours. It is measured in megabytes, and when it runs out it runs out for everyone.",
          "She is a good student. That was never in question. What was in question was whether the internet would let her be one.",
        ],
      },
      {
        heading: "Six megabytes of hero video",
        body: [
          "Most scholarship portals are built by people who have never had to think about this. A landing page that loads six megabytes of autoplaying video costs her a week of browsing. A form that times out and loses her answers costs her the entire attempt, and there is no guarantee of another window.",
          "She had abandoned three applications this way before anyone asked why. From the other side it looks like a candidate who did not follow through.",
        ],
      },
      {
        heading: "The product is that it loads",
        body: [
          "For Halima the promise of an opportunity platform is not the intelligence. It is that the thing opens at all — in a language she reads, on the phone she actually owns, without spending the bundle before she reaches the apply button.",
          "Every decision behind Edutu For You is downstream of her: keep pages light, keep drafts saved, keep the deadline reminders working over SMS-grade connections, and never assume a second attempt is free.",
        ],
      },
    ],
    stats: [
      { value: "5", label: "people sharing one data bundle" },
      { value: "3", label: "applications abandoned to timeouts" },
      { value: "1", label: "attempt she can usually afford" },
    ],
    barrier:
      "For Halima, low-bandwidth access is not a feature of the product. It is the product.",
  },
  {
    slug: "chipo-bulawayo",
    name: "Chipo",
    age: 21,
    place: "Bulawayo, Zimbabwe",
    outcome: "Agri-tech grant",
    portrait: `https://images.unsplash.com/photo-1512361436605-a484bdb34b5f?${PORTRAIT}`,
    portraitAlt: "A young woman in glasses looking at the camera",
    heroImage: `https://images.unsplash.com/photo-1492462543947-040389c4a66c?${WIDE}`,
    heroAlt: "A young person walking through a busy street",
    quote: "I was told grants were for people with offices.",
    teaser:
      "She had run a working irrigation business for two years and did not believe she counted as a founder.",
    chapters: [
      {
        heading: "A business she did not call a business",
        body: [
          "Chipo had been selling drip-irrigation kits to smallholder farmers around Bulawayo for two years. She had customers, repeat orders, a supplier and a margin.",
          "She did not describe herself as a founder, because in her mind founders had offices, registration certificates and pitch decks. She had a notebook and a phone.",
        ],
      },
      {
        heading: "The self-disqualification problem",
        body: [
          "The most expensive thing in her way was not a form. It was a belief that grant programmes were for other people — better-dressed, better-connected, further along.",
          "This is the failure mode nobody designs for. Every eligibility filter in the world does not help someone who has already filtered themselves out before reading the criteria.",
          "What moved her was seeing the criteria stated plainly next to what she already had, and realising she cleared them. Not encouragement. Evidence.",
        ],
      },
      {
        heading: "Translating a notebook into an application",
        body: [
          "The work after that was translation. Two years of orders in a notebook became traction. Her supplier relationship became a supply chain. The farmers who kept re-ordering became retention.",
          "None of that was invention. It was describing what she had already built in the vocabulary the people with money happen to use.",
        ],
      },
    ],
    stats: [
      { value: "2 years", label: "trading before she called it a business" },
      { value: "0", label: "grant applications attempted before" },
      { value: "1", label: "notebook, translated into traction" },
    ],
    barrier:
      "She met the criteria for two years before anyone showed her the criteria.",
  },
  {
    slug: "emeka-enugu",
    name: "Emeka",
    age: 22,
    place: "Enugu, Nigeria",
    outcome: "Exchange programme place",
    portrait: `https://images.unsplash.com/photo-1533469513-03bfed91f496?${PORTRAIT}`,
    portraitAlt: "A young man in glasses looking at the camera",
    heroImage: `https://images.unsplash.com/photo-1685538856920-9c7cdd86a49c?${WIDE}`,
    heroAlt: "A young man sitting outdoors with his phone",
    quote: "I kept being told my English was the problem. It wasn't.",
    teaser:
      "First in his family to finish secondary school, and the first to try writing an essay nobody could check.",
    chapters: [
      {
        heading: "Nobody to read the draft",
        body: [
          "Emeka was the first person in his family to finish secondary school, which meant he was also the first to attempt an application essay with nobody at home able to read it back to him.",
          "He wrote seven drafts of one essay. Each one he judged entirely on his own, in a vacuum, against a standard he was guessing at.",
        ],
      },
      {
        heading: "Fluency was never the issue",
        body: [
          "He had been told twice that his English let him down. It was not true, and it did real damage. His English was fine. What he was missing was structure — the shape a selection panel expects an answer to take, and the difference between describing an experience and making an argument with it.",
          "That is a learnable thing, and it takes about an hour to explain. Most applicants get that hour from a teacher, a sibling or a friend who has already been through it. Emeka had nobody in that position, so he substituted six more drafts for one conversation.",
        ],
      },
      {
        heading: "One conversation, one draft",
        body: [
          "The eighth draft was not more polished. It was differently organised — a claim, then evidence from his own life, then what it meant for what he wanted to do next.",
          "He submitted it in a week rather than a term, and spent the time he got back on the rest of the application.",
        ],
      },
    ],
    stats: [
      { value: "7", label: "drafts written with no reader" },
      { value: "1", label: "conversation that changed the structure" },
      { value: "1st", label: "in his family to finish secondary school" },
    ],
    barrier:
      "He was never short of ability or English. He was short of one hour from someone who had done it before.",
  },
  {
    slug: "fatou-dakar",
    name: "Fatou",
    age: 20,
    place: "Dakar, Senegal",
    outcome: "Francophone fellowship",
    portrait: `https://images.unsplash.com/photo-1611877247362-93a1536ad38e?${PORTRAIT}`,
    portraitAlt: "A young woman smiling at the camera",
    heroImage: `https://images.unsplash.com/photo-1773921405175-73a401883099?${WIDE}`,
    heroAlt: "A graduate sitting outdoors in cap and gown",
    quote: "The opportunities existed in my language. The lists didn't.",
    teaser:
      "Francophone West Africa is a third of the continent's students and a fraction of what most opportunity lists cover.",
    chapters: [
      {
        heading: "A search that returns nothing",
        body: [
          "Fatou studies in French, thinks in Wolof and French, and reads English slowly and with effort. Almost every scholarship aggregator she found was English-first, and quietly assumed its users were too.",
          "The programmes she was eligible for did exist — francophone fellowships, regional funds, French-language exchanges. They were simply not on the lists that reached her.",
        ],
      },
      {
        heading: "Language as an eligibility filter nobody declared",
        body: [
          "This is a structural exclusion, not a personal one. When the discovery layer is English-only, an entire linguistic region is filtered out before eligibility is ever assessed — and then described, later, as harder to reach.",
          "Fatou was not hard to reach. She was searching, consistently, in the wrong index.",
        ],
      },
      {
        heading: "Reading in the language you think in",
        body: [
          "Reading an opportunity in your own language is not a convenience. It changes what you notice: the caveat in the eligibility line, the thing the funder says they care about, the deadline that is a submission date and not a decision date.",
          "Fatou did not need help understanding opportunities. She needed them to arrive in a language she could read at full speed.",
        ],
      },
    ],
    stats: [
      { value: "9", label: "languages Edutu now surfaces opportunities in" },
      { value: "0", label: "francophone listings on the aggregators she tried" },
      { value: "~1/3", label: "of the continent's students study in French" },
    ],
    barrier:
      "She was never hard to reach. The index she was searching simply did not include her.",
  },
  {
    slug: "brian-kisumu",
    name: "Brian",
    age: 24,
    place: "Kisumu, Kenya",
    outcome: "Engineering scholarship",
    portrait: `https://images.unsplash.com/photo-1546525848-3ce03ca516f6?${PORTRAIT}`,
    portraitAlt: "A young man with a backpack outdoors",
    heroImage: `https://images.unsplash.com/photo-1643488422823-ca046d82123b?${WIDE}`,
    heroAlt: "A graduate in cap and gown on the phone",
    quote: "Every deadline I missed, I missed while working.",
    teaser:
      "He rode a boda-boda six days a week to fund a diploma, and lost opportunities to the calendar rather than the competition.",
    chapters: [
      {
        heading: "Funding your own education by the hour",
        body: [
          "Brian rode a motorbike taxi six days a week to pay for a diploma he was taking part-time. His study happened after nine at night, and his application admin happened whenever it could.",
          "He was not short of drive. He was short of the one thing applications quietly demand: unbroken attention arriving at the right moment.",
        ],
      },
      {
        heading: "Losing to the calendar",
        body: [
          "Three scholarships passed him in eighteen months. He was eligible for all three. He missed one entirely, found one four days before closing with no time to gather documents, and submitted the third in a rush that showed.",
          "None of those were losses to a better candidate. They were losses to a calendar nobody was holding for him.",
        ],
      },
      {
        heading: "Something that remembers on your behalf",
        body: [
          "What actually changed his year was unglamorous: deadlines tracked, documents kept in one place, and a reminder that arrived early enough to be useful rather than the night before.",
          "For someone with time to spare, that is a convenience. For someone working six days a week, it is the difference between applying and not.",
        ],
      },
    ],
    stats: [
      { value: "6 days", label: "a week working to fund his own study" },
      { value: "3", label: "scholarships missed to timing, not merit" },
      { value: "4 days", label: "notice on the one he nearly made" },
    ],
    barrier:
      "He never lost to a better candidate. He lost to a calendar nobody was holding for him.",
  },
  {
    slug: "naledi-soweto",
    name: "Naledi",
    age: 18,
    place: "Soweto, South Africa",
    outcome: "Full bursary",
    portrait: `https://images.unsplash.com/photo-1612214495858-4f32b96155a7?${PORTRAIT}`,
    portraitAlt: "A young graduate smiling in cap and gown",
    heroImage: `https://images.unsplash.com/photo-1777186476863-7dca35c38863?${WIDE}`,
    heroAlt: "A young graduate in cap and gown",
    quote: "I thought bursaries were something you got offered, not something you applied for.",
    teaser:
      "She finished near the top of her year without knowing that funding was something you go and ask for.",
    chapters: [
      {
        heading: "Excellent, and uninformed",
        body: [
          "Naledi finished matric near the top of her year. She also finished it believing that bursaries arrived — that someone noticed you, and an offer followed.",
          "It is an entirely reasonable belief if nobody has told you otherwise. It is also the single most expensive misunderstanding a talented eighteen-year-old can hold, because the application window closes while you are waiting to be discovered.",
        ],
      },
      {
        heading: "The information is free and still doesn't arrive",
        body: [
          "Nothing about the bursaries she qualified for was secret. The criteria were published. The forms were free. The deadlines were public.",
          "And none of it reached her, because publication is not distribution. A thing being available is not the same as a specific person finding out about it in time to act.",
        ],
      },
      {
        heading: "Applying, on purpose",
        body: [
          "She applied to five funds in one season, having applied to none in her life before. Two came back positively.",
          "The shift was not academic. She had already done that part. The shift was learning that funding is a thing you pursue.",
        ],
      },
    ],
    stats: [
      { value: "0", label: "bursary applications before that season" },
      { value: "5", label: "sent once she knew they existed" },
      { value: "R0", label: "cost of the information she never received" },
    ],
    barrier:
      "Publication is not distribution. The information was free, public — and never reached her.",
  },
  {
    slug: "yohannes-addis",
    name: "Yohannes",
    age: 23,
    place: "Addis Ababa, Ethiopia",
    outcome: "Data fellowship",
    portrait: `https://images.unsplash.com/photo-1729691031378-d63d7e81bb38?${PORTRAIT}`,
    portraitAlt: "A young man in a shirt and tie",
    heroImage: `https://images.unsplash.com/photo-1622295023876-0cdf583c41f6?${WIDE}`,
    heroAlt: "A young man reading beside a laptop",
    quote: "I had the skills and no way to prove them.",
    teaser:
      "Self-taught statistics, real analysis work, and no certificate that any selection panel recognised.",
    chapters: [
      {
        heading: "Skills without paperwork",
        body: [
          "Yohannes taught himself statistics from free courses and had done genuine analysis work — for a clinic, for a small logistics firm, unpaid and then barely paid.",
          "What he did not have was a credential any panel recognised. His experience was real and completely illegible to the people making decisions.",
        ],
      },
      {
        heading: "The evidence problem",
        body: [
          "Selection panels do not reward ability directly. They reward legible evidence of ability, and those are different things.",
          "Most advice at this point is to get a certificate, which costs money he did not have. The more useful move was assembling what he already had into evidence: a written case study of the clinic work, a short portfolio, and two people willing to confirm what he had done.",
          "None of that was new work. It was making existing work visible.",
        ],
      },
      {
        heading: "Legibility, not luck",
        body: [
          "He applied to a data fellowship with the same skills he had held for two years, presented so that a stranger could verify them in four minutes.",
          "That is what most of application coaching actually is. Not improving the candidate — making the candidate legible.",
        ],
      },
    ],
    stats: [
      { value: "2 years", label: "of real analysis work, unrecognised" },
      { value: "0", label: "formal credentials" },
      { value: "4 min", label: "for a stranger to verify it, once assembled" },
    ],
    barrier:
      "Panels reward legible evidence of ability, not ability. Nobody had ever told him those were different.",
  },
];

export const STORIES: Story[] = SEED.map((story) => ({
  ...story,
  isComposite: true,
}));

/** Lookup used by the story route. */
export function findStory(slug: string | undefined): Story | undefined {
  return STORIES.find((story) => story.slug === slug);
}
