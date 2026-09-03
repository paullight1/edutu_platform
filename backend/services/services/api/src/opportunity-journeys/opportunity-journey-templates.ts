export type OpportunityTemplateKind =
  | "scholarship"
  | "employment"
  | "fellowship"
  | "grant"
  | "lightweight";

export interface OpportunityJourneyTaskTemplate {
  taskType: string;
  title: string;
  description: string;
  position: number;
  required: boolean;
  source: "template";
}

const TEMPLATE_TASKS: Record<
  OpportunityTemplateKind,
  Array<Omit<OpportunityJourneyTaskTemplate, "position" | "source">>
> = {
  scholarship: [
    {
      taskType: "eligibility",
      title: "Confirm final eligibility",
      description: "Check the official country, age, education, and programme rules.",
      required: true,
    },
    {
      taskType: "document",
      title: "Collect transcript and academic records",
      description: "Gather the latest transcript and any required certificates.",
      required: true,
    },
    {
      taskType: "reference",
      title: "Request required references",
      description: "Contact referees early and share the official requirements.",
      required: true,
    },
    {
      taskType: "statement",
      title: "Draft your personal statement",
      description: "Connect your experience, goal, and intended impact to the opportunity.",
      required: true,
    },
    {
      taskType: "review",
      title: "Review the application and supporting documents",
      description: "Check every response, document, name, date, and required field.",
      required: true,
    },
    {
      taskType: "open_application",
      title: "Open the official application",
      description: "Continue on the verified official application page.",
      required: true,
    },
  ],
  employment: [
    {
      taskType: "eligibility",
      title: "Confirm the role requirements",
      description: "Check location, experience, education, and work-authorisation requirements.",
      required: true,
    },
    {
      taskType: "cv",
      title: "Update your CV for the role",
      description: "Emphasise the evidence most relevant to the job or internship.",
      required: true,
    },
    {
      taskType: "portfolio",
      title: "Prepare your portfolio or work evidence",
      description: "Select concise examples that prove the required skills.",
      required: false,
    },
    {
      taskType: "cover_letter",
      title: "Draft the cover letter or application answers",
      description: "Explain your fit with specific evidence rather than generic claims.",
      required: true,
    },
    {
      taskType: "review",
      title: "Review the complete application",
      description: "Check the CV, answers, links, contact details, and attachments.",
      required: true,
    },
    {
      taskType: "open_application",
      title: "Open the official application",
      description: "Continue on the verified employer or programme application page.",
      required: true,
    },
  ],
  fellowship: [
    {
      taskType: "eligibility",
      title: "Confirm programme eligibility",
      description: "Check cohort, location, experience, and participation rules.",
      required: true,
    },
    {
      taskType: "profile",
      title: "Prepare your CV or biography",
      description: "Summarise the experience and impact most relevant to the programme.",
      required: true,
    },
    {
      taskType: "motivation",
      title: "Draft motivation and impact answers",
      description: "Show a clear goal, credible evidence, and the impact you intend to create.",
      required: true,
    },
    {
      taskType: "reference",
      title: "Collect references or endorsements",
      description: "Confirm whether a referee or organisational endorsement is required.",
      required: false,
    },
    {
      taskType: "review",
      title: "Review the programme application",
      description: "Check every answer and supporting item against the official criteria.",
      required: true,
    },
    {
      taskType: "open_application",
      title: "Open the official application",
      description: "Continue on the verified programme application page.",
      required: true,
    },
  ],
  grant: [
    {
      taskType: "eligibility",
      title: "Confirm applicant and project eligibility",
      description: "Check registration, sector, location, stage, and funding restrictions.",
      required: true,
    },
    {
      taskType: "project",
      title: "Define the project objective",
      description: "State the problem, proposed solution, beneficiaries, and measurable result.",
      required: true,
    },
    {
      taskType: "budget",
      title: "Prepare the project budget",
      description: "Connect every cost to a realistic activity and outcome.",
      required: true,
    },
    {
      taskType: "evidence",
      title: "Collect supporting evidence",
      description: "Gather registration, traction, references, accounts, or other required proof.",
      required: true,
    },
    {
      taskType: "proposal",
      title: "Draft and review the proposal",
      description: "Answer the funder's criteria clearly and verify every figure.",
      required: true,
    },
    {
      taskType: "open_application",
      title: "Open the official application",
      description: "Continue on the verified funder application page.",
      required: true,
    },
  ],
  lightweight: [
    {
      taskType: "eligibility",
      title: "Confirm participation requirements",
      description: "Check eligibility, schedule, location, cost, and attendance expectations.",
      required: true,
    },
    {
      taskType: "profile",
      title: "Prepare your profile or portfolio",
      description: "Collect the short profile, links, or evidence requested by the organiser.",
      required: false,
    },
    {
      taskType: "answers",
      title: "Draft the required answers",
      description: "Prepare concise responses aligned with the selection criteria.",
      required: true,
    },
    {
      taskType: "review",
      title: "Review the registration details",
      description: "Check required fields, dates, links, and attachments.",
      required: true,
    },
    {
      taskType: "open_application",
      title: "Open the official application",
      description: "Continue on the verified registration or application page.",
      required: true,
    },
  ],
};

export function resolveOpportunityTemplateKind(
  category: string | null | undefined,
): OpportunityTemplateKind {
  const value = (category ?? "").toLowerCase().replace(/[_-]+/gu, " ");
  if (value.includes("scholarship") || value.includes("bursary")) {
    return "scholarship";
  }
  if (
    value.includes("job") ||
    value.includes("role") ||
    value.includes("employment") ||
    value.includes("intern") ||
    value.includes("apprentice")
  ) {
    return "employment";
  }
  if (
    value.includes("fellowship") ||
    value.includes("leadership") ||
    value.includes("programme") ||
    value.includes("program")
  ) {
    return "fellowship";
  }
  if (
    value.includes("grant") ||
    value.includes("funding") ||
    value.includes("startup")
  ) {
    return "grant";
  }
  return "lightweight";
}

export function resolveOpportunityJourneyTemplate(
  categoryOrKind: string | null | undefined,
): OpportunityJourneyTaskTemplate[] {
  const kind = (
    categoryOrKind && categoryOrKind in TEMPLATE_TASKS
      ? categoryOrKind
      : resolveOpportunityTemplateKind(categoryOrKind)
  ) as OpportunityTemplateKind;

  return TEMPLATE_TASKS[kind].map((task, position) => ({
    ...task,
    position,
    source: "template",
  }));
}
