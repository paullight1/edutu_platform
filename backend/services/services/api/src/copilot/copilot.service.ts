import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { desc, eq, and } from "drizzle-orm";
import { AiService } from "../ai";
import { MonetizationService } from "../monetization/monetization.service";
import { matchProfileUserId, toDatabaseUserId } from "../common/user-id";
import { db } from "../db";
import {
  applicationKits,
  goals as goalsTable,
  opportunities,
  profiles,
  type ApplicationKit,
} from "../db/schema";
import {
  EssayFeedbackDto,
  FeedbackSchema,
  GenerateOutlineDto,
  KitContent,
  KitContentSchema,
  OutlineSchema,
  SaveEssayDraftDto,
  UpdateChecklistDto,
  type EssayFeedback,
  type EssayOutline,
  type EssayWorkspaceEntry,
} from "./dto/copilot.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * LLMs regularly emit `null` for fields they have no value for, which Zod's
 * `.optional()` rejects. Drop nulls recursively before validating.
 */
function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => stripNulls(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)]),
    ) as T;
  }
  return value;
}

type OpportunityContext = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  organization: string | null;
  category: string | null;
  deadline: Date | null;
  eligibilityCriteria: string | null;
  fundingType: string | null;
  targetRegion: string | null;
  imageUrl: string | null;
  applyUrl: string | null;
  location: string | null;
  type: string | null;
  eligibility: Record<string, unknown> | null;
  requirements: string[];
  benefits: string[];
  applicationProcess: string[];
};

type ProfileContext = {
  fullName?: string;
  country?: string;
  school?: string;
  major?: string;
  degree?: string;
  age?: number;
  cgpa?: string;
  gradYear?: number;
  interests?: string[];
  skills?: string[];
  interestedCountries?: string[];
  goals?: Array<{ title: string; description?: string }>;
};

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly monetizationService: MonetizationService,
  ) {}

  // -------------------------------------------------------------------------
  // Kit CRUD
  // -------------------------------------------------------------------------

  async listKits(userId: string) {
    const dbUserId = this.requireUserId(userId);
    const rows = await db
      .select({
        id: applicationKits.id,
        opportunityId: applicationKits.opportunityId,
        kit: applicationKits.kit,
        essays: applicationKits.essays,
        checklistState: applicationKits.checklistState,
        generatedBy: applicationKits.generatedBy,
        createdAt: applicationKits.createdAt,
        updatedAt: applicationKits.updatedAt,
        opportunityTitle: opportunities.title,
        opportunityDeadline: opportunities.deadline,
        opportunityOrganization: opportunities.organization,
        opportunityImageUrl: opportunities.imageUrl,
        opportunityCategory: opportunities.category,
      })
      .from(applicationKits)
      .leftJoin(
        opportunities,
        eq(applicationKits.opportunityId, opportunities.id),
      )
      .where(eq(applicationKits.userId, dbUserId))
      .orderBy(desc(applicationKits.updatedAt))
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      opportunityId: row.opportunityId,
      kit: row.kit,
      essays: row.essays,
      checklistState: row.checklistState,
      generatedBy: row.generatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      opportunity: {
        id: row.opportunityId,
        title: row.opportunityTitle,
        deadline: row.opportunityDeadline,
        organization: row.opportunityOrganization,
        imageUrl: row.opportunityImageUrl,
        category: row.opportunityCategory,
      },
    }));
  }

  async getKit(userId: string, opportunityId: string) {
    const row = await this.findKit(userId, opportunityId);
    if (!row) throw new NotFoundException("Application kit not found");
    return row;
  }

  async deleteKit(userId: string, opportunityId: string) {
    this.assertUuid(opportunityId, "opportunity id");
    const dbUserId = this.requireUserId(userId);
    await db
      .delete(applicationKits)
      .where(
        and(
          eq(applicationKits.userId, dbUserId),
          eq(applicationKits.opportunityId, opportunityId),
        ),
      );
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // AI: application kit generation
  // -------------------------------------------------------------------------

  async generateKit(
    userId: string,
    opportunityId: string,
    refresh = false,
    authId?: string,
  ) {
    this.assertUuid(opportunityId, "opportunity id");
    const dbUserId = this.requireUserId(userId);

    // A cached kit makes no AI call — return it for FREE (metering used to run
    // in the interceptor before the handler, charging 15 credits for this).
    if (!refresh) {
      const existing = await this.findKit(userId, opportunityId);
      if (existing && Object.keys(existing.kit || {}).length) return existing;
    }

    // P2.3: on refresh the checklist is regenerated, but the user's ticks live
    // in `checklistState` keyed by item id (and are preserved by the upsert
    // below). The AI mints fresh ids each time, which would orphan those ticks —
    // so capture the previous checklist now and re-map matching labels back onto
    // their old ids after generation, keeping preserved ticks aligned.
    let previousChecklist: KitContent["checklist"] = [];
    if (refresh) {
      const previous = await this.findKit(userId, opportunityId);
      previousChecklist =
        ((previous?.kit ?? {}) as Partial<KitContent>).checklist ?? [];
    }

    // Charge here (after the cache check), and refund below if we can't produce
    // a real AI kit — so the heuristic fallback template costs nothing.
    const charge = await this.monetizationService.meter(dbUserId, "copilotKit");

    let opportunity: OpportunityContext;
    let profile: ProfileContext;
    try {
      opportunity = await this.loadOpportunity(opportunityId);
      profile = await this.loadProfile(dbUserId, authId);
    } catch (error) {
      void this.monetizationService.refund(charge);
      throw error;
    }

    let content: KitContent | null = null;
    let generatedBy: "ai" | "fallback" = "ai";

    try {
      const parsed = await this.aiService.generateJson({
        feature: "copilot.kit",
        prompt: this.buildKitPrompt(opportunity, profile),
        responseMimeType: "application/json",
        temperature: 0.3,
        metadata: { userId: dbUserId, opportunityId },
      });
      if (parsed) content = KitContentSchema.parse(stripNulls(parsed));
    } catch (error) {
      this.logger.warn(
        `Copilot kit generation fell back to heuristic mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // P2.2 concurrent-generation guard: the AI call above can be slow, so a
    // second generate for the same kit may have finished and written content
    // while we waited. Don't double-charge or clobber the winner (the upsert
    // below would otherwise overwrite it, and a retry-happy client would be
    // billed twice) — refund our charge and return the kit that already landed.
    if (!refresh) {
      const concurrent = await this.findKit(userId, opportunityId);
      if (concurrent && Object.keys(concurrent.kit || {}).length) {
        void this.monetizationService.refund(charge);
        return {
          ...(await this.withOpportunity(concurrent, opportunity)),
          profileGrounded: this.isProfileGrounded(profile),
        };
      }
    }

    if (!content) {
      content = this.buildFallbackKit(opportunity, profile);
      generatedBy = "fallback";
      // No real AI output was produced — hand the credits back.
      void this.monetizationService.refund(charge);
    }

    this.ensureStableIds(content);
    // P2.3: re-map regenerated checklist ids onto matching previous labels so
    // preserved `checklistState` ticks still line up after a refresh.
    this.carryOverChecklistIds(content, previousChecklist);

    // Preserve the user's working state (essays, checklist ticks) on refresh.
    const [saved] = await db
      .insert(applicationKits)
      .values({
        userId: dbUserId,
        opportunityId,
        kit: content as unknown as Record<string, unknown>,
        generatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [applicationKits.userId, applicationKits.opportunityId],
        set: {
          kit: content as unknown as Record<string, unknown>,
          generatedBy,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Lets the client show "Complete your profile for a sharper kit" instead of
    // pretending an empty-profile kit is personalized (P0.1).
    const profileGrounded = this.isProfileGrounded(profile);
    return {
      ...(await this.withOpportunity(saved, opportunity)),
      profileGrounded,
    };
  }

  /** True when the profile has any signal worth grounding the kit on. */
  private isProfileGrounded(profile: ProfileContext): boolean {
    return Boolean(
      profile.country ||
      profile.major ||
      profile.degree ||
      profile.school ||
      profile.interests?.length ||
      profile.skills?.length,
    );
  }

  // -------------------------------------------------------------------------
  // AI: essay outline
  // -------------------------------------------------------------------------

  async generateOutline(
    userId: string,
    opportunityId: string,
    dto: GenerateOutlineDto,
    authId?: string,
  ) {
    this.assertUuid(opportunityId, "opportunity id");
    const dbUserId = this.requireUserId(userId);
    const kitRow = await this.requireKit(dbUserId, opportunityId);
    const promptText = this.resolvePromptText(kitRow, dto.promptId, dto.prompt);

    // Metered here (was @AiMetered) so the heuristic fallback can be refunded.
    const charge = await this.monetizationService.meter(
      dbUserId,
      "copilotAssist",
    );

    let opportunity: OpportunityContext;
    let profile: ProfileContext;
    try {
      opportunity = await this.loadOpportunity(opportunityId);
      profile = await this.loadProfile(dbUserId, authId);
    } catch (error) {
      void this.monetizationService.refund(charge);
      throw error;
    }

    let outline: EssayOutline | null = null;
    let source: "ai" | "fallback" = "ai";

    try {
      const parsed = await this.aiService.generateJson({
        feature: "copilot.outline",
        prompt: this.buildOutlinePrompt(
          opportunity,
          profile,
          promptText,
          dto.angle,
        ),
        responseMimeType: "application/json",
        temperature: 0.4,
        metadata: { userId: dbUserId, opportunityId },
      });
      if (parsed) outline = OutlineSchema.parse(stripNulls(parsed));
    } catch (error) {
      this.logger.warn(
        `Copilot outline fell back to heuristic mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!outline) {
      outline = this.buildFallbackOutline(opportunity, promptText);
      source = "fallback";
      void this.monetizationService.refund(charge);
    }

    await this.upsertEssayEntry(
      dbUserId,
      opportunityId,
      dto.promptId,
      promptText,
      {
        outline,
      },
    );

    return { outline, source };
  }

  // -------------------------------------------------------------------------
  // AI: draft feedback
  // -------------------------------------------------------------------------

  async essayFeedback(
    userId: string,
    opportunityId: string,
    dto: EssayFeedbackDto,
  ) {
    this.assertUuid(opportunityId, "opportunity id");
    const dbUserId = this.requireUserId(userId);
    const kitRow = await this.requireKit(dbUserId, opportunityId);
    const promptText = this.resolvePromptText(kitRow, dto.promptId, dto.prompt);

    // Metered here (was @AiMetered) so the heuristic fallback can be refunded.
    const charge = await this.monetizationService.meter(
      dbUserId,
      "copilotAssist",
    );

    let opportunity: OpportunityContext;
    try {
      opportunity = await this.loadOpportunity(opportunityId);
    } catch (error) {
      void this.monetizationService.refund(charge);
      throw error;
    }

    let feedback: EssayFeedback | null = null;
    let source: "ai" | "fallback" = "ai";

    try {
      const parsed = await this.aiService.generateJson({
        feature: "copilot.feedback",
        prompt: this.buildFeedbackPrompt(opportunity, promptText, dto.draft),
        responseMimeType: "application/json",
        temperature: 0.3,
        metadata: { userId: dbUserId, opportunityId },
      });
      if (parsed) feedback = FeedbackSchema.parse(stripNulls(parsed));
    } catch (error) {
      this.logger.warn(
        `Copilot feedback fell back to heuristic mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!feedback) {
      feedback = this.buildFallbackFeedback(dto.draft);
      source = "fallback";
      void this.monetizationService.refund(charge);
    }

    await this.upsertEssayEntry(
      dbUserId,
      opportunityId,
      dto.promptId,
      promptText,
      {
        draft: dto.draft,
        feedback,
      },
    );

    return { feedback, source };
  }

  // -------------------------------------------------------------------------
  // Working state
  // -------------------------------------------------------------------------

  async saveEssayDraft(
    userId: string,
    opportunityId: string,
    dto: SaveEssayDraftDto,
  ) {
    this.assertUuid(opportunityId, "opportunity id");
    const dbUserId = this.requireUserId(userId);
    const kitRow = await this.requireKit(dbUserId, opportunityId);
    const promptText = this.resolvePromptText(kitRow, dto.promptId, dto.prompt);
    await this.upsertEssayEntry(
      dbUserId,
      opportunityId,
      dto.promptId,
      promptText,
      {
        draft: dto.draft,
      },
    );
    return { success: true };
  }

  async updateChecklist(
    userId: string,
    opportunityId: string,
    dto: UpdateChecklistDto,
  ) {
    this.assertUuid(opportunityId, "opportunity id");
    const dbUserId = this.requireUserId(userId);
    const kitRow = await this.requireKit(dbUserId, opportunityId);
    const state = { ...(kitRow.checklistState || {}) };
    if (dto.done) state[dto.itemId] = true;
    else delete state[dto.itemId];

    await db
      .update(applicationKits)
      .set({ checklistState: state, updatedAt: new Date() })
      .where(eq(applicationKits.id, kitRow.id));

    return { success: true, checklistState: state };
  }

  // -------------------------------------------------------------------------
  // Prompts
  // -------------------------------------------------------------------------

  private buildKitPrompt(
    opportunity: OpportunityContext,
    profile: ProfileContext,
  ): string {
    return [
      "You are Edutu, an expert scholarship and opportunity application coach for ambitious students and young professionals (strong African/emerging-market focus).",
      "Build a personalized APPLICATION KIT for the applicant below. Respond with JSON only, matching exactly this shape:",
      `{
  "fitNote": "2-3 sentences on why THIS applicant is a credible candidate and what to emphasize. Address the applicant as 'you'. Be specific to their profile, never generic.",
  "strategy": ["3-5 sharp, specific strategy tips for winning THIS opportunity"],
  "checklist": [{ "id": "kebab-slug", "label": "short imperative item", "detail": "optional 1-sentence explanation", "category": "documents|eligibility|preparation|submission" }],
  "essayPrompts": [{ "id": "kebab-slug", "prompt": "a likely essay/statement question for this application", "guidance": "1-2 sentences on what reviewers want here", "suggestedAngle": "1 sentence: the strongest angle for THIS applicant" }],
  "eligibilityFlags": [{ "flag": "a real eligibility conflict for THIS applicant, in plain language", "severity": "blocker|warning" }],
  "gaps": ["the 2-3 biggest competitive gaps this applicant should close to be a strong candidate"]
}`,
      "Rules:",
      "- eligibilityFlags: compare the applicant's country / education level / field / age / graduation year against the opportunity's stated eligibility. List only REAL conflicts. Use severity 'blocker' ONLY when the eligibility text explicitly rules them out (e.g. wrong country, wrong degree level); use 'warning' when it's a likely-but-unstated concern. If eligibility is unknown or the applicant clearly qualifies, return an empty array — never invent a rule.",
      "- gaps: 2-3 honest, specific competitive gaps (missing experience, skills, or credentials this opportunity rewards). Be candid, not discouraging. Empty array only if the applicant is already exceptionally strong.",
      "- checklist: 6-10 items covering required documents, eligibility proofs, preparation steps and submission steps. Derive from the opportunity's requirements/application process where given. Where the listing is silent, only include universal staples (CV, transcripts, referees, deadline buffer) and phrase them as 'confirm on the official page' — never present a guessed requirement as fact.",
      "- essayPrompts: 2-4 prompts. If the opportunity text mentions specific essay/statement questions, use those verbatim. Otherwise mark predicted prompts clearly in the guidance as 'predicted — the official form may differ'.",
      "- Never invent eligibility rules, deadlines, fees, or award amounts that are not in the OPPORTUNITY text. When something material is unknown, the checklist item should be to verify it at the source.",
      "- Direct, encouraging, never bureaucratic. No markdown in values.",
      "",
      `OPPORTUNITY:\n${this.describeOpportunity(opportunity)}`,
      "",
      `APPLICANT PROFILE:\n${this.describeProfile(profile)}`,
    ].join("\n");
  }

  private buildOutlinePrompt(
    opportunity: OpportunityContext,
    profile: ProfileContext,
    promptText: string,
    angle?: string,
  ): string {
    return [
      "You are Edutu, an expert application-essay coach. Create a personalized essay OUTLINE for the applicant below. Respond with JSON only, matching exactly this shape:",
      `{
  "thesis": "the single core message the essay should land, written for THIS applicant",
  "hook": "a concrete suggestion for the opening 1-2 sentences",
  "sections": [{ "heading": "section purpose", "points": ["2-4 specific points to make, tied to the applicant's profile"] }],
  "closing": "how to end memorably",
  "avoid": ["2-4 clichés or mistakes to avoid for this specific prompt"]
}`,
      "Rules: 3-5 sections. Points must reference the applicant's actual background where possible — never placeholder advice. No markdown in values.",
      "",
      `ESSAY PROMPT: ${promptText}`,
      angle ? `APPLICANT'S CHOSEN ANGLE: ${angle}` : "",
      "",
      `OPPORTUNITY:\n${this.describeOpportunity(opportunity)}`,
      "",
      `APPLICANT PROFILE:\n${this.describeProfile(profile)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildFeedbackPrompt(
    opportunity: OpportunityContext,
    promptText: string,
    draft: string,
  ): string {
    return [
      "You are Edutu, a rigorous but encouraging application-essay reviewer. Score and critique the draft below as a selection-committee reviewer for this opportunity would. Respond with JSON only, matching exactly this shape:",
      `{
  "overallScore": 0-100,
  "scores": { "clarity": 0-10, "relevance": 0-10, "impact": 0-10, "authenticity": 0-10 },
  "verdict": "1-2 sentence overall read of the draft",
  "strengths": ["2-4 specific strengths, quoting the draft where useful"],
  "improvements": ["3-5 concrete, actionable improvements in priority order"],
  "lineEdits": [{ "original": "exact short phrase from the draft", "suggestion": "stronger rewrite", "reason": "why" }],
  "revisedOpening": "a rewritten first 1-2 sentences that would grab a reviewer"
}`,
      "Rules: lineEdits must quote text that actually appears in the draft (max 4 edits). Be honest — a weak draft should score low. No markdown in values.",
      "",
      `ESSAY PROMPT: ${promptText}`,
      "",
      `OPPORTUNITY: ${opportunity.title}${opportunity.organization ? ` — ${opportunity.organization}` : ""} (${opportunity.category || "opportunity"})`,
      "",
      `DRAFT (${draft.trim().split(/\s+/).length} words):\n${draft.slice(0, 16000)}`,
    ].join("\n");
  }

  private describeOpportunity(opportunity: OpportunityContext): string {
    const deadline = opportunity.deadline
      ? new Date(opportunity.deadline).toISOString().slice(0, 10)
      : "not stated";
    const lines = [
      `Title: ${opportunity.title}`,
      opportunity.organization
        ? `Organization: ${opportunity.organization}`
        : "",
      `Category: ${opportunity.category || "unknown"}`,
      opportunity.type ? `Type: ${opportunity.type}` : "",
      `Deadline: ${deadline}`,
      opportunity.location ? `Location: ${opportunity.location}` : "",
      opportunity.fundingType ? `Funding: ${opportunity.fundingType}` : "",
      opportunity.targetRegion
        ? `Target region: ${opportunity.targetRegion}`
        : "",
      opportunity.summary ? `Summary: ${opportunity.summary}` : "",
      opportunity.eligibilityCriteria
        ? `Eligibility (text): ${opportunity.eligibilityCriteria}`
        : "",
      opportunity.eligibility && Object.keys(opportunity.eligibility).length
        ? `Eligibility (structured): ${JSON.stringify(opportunity.eligibility)}`
        : "",
      opportunity.requirements.length
        ? `Requirements: ${opportunity.requirements.join("; ")}`
        : "",
      opportunity.applicationProcess.length
        ? `Application process: ${opportunity.applicationProcess.join("; ")}`
        : "",
      opportunity.benefits.length
        ? `Benefits: ${opportunity.benefits.join("; ")}`
        : "",
      opportunity.description
        ? `Description: ${opportunity.description.slice(0, 4000)}`
        : "",
    ];
    return lines.filter(Boolean).join("\n");
  }

  private describeProfile(profile: ProfileContext): string {
    const lines = [
      profile.fullName ? `Name: ${profile.fullName}` : "",
      profile.country ? `Country: ${profile.country}` : "",
      profile.school ? `Institution: ${profile.school}` : "",
      profile.major ? `Field of study: ${profile.major}` : "",
      profile.degree ? `Education level: ${profile.degree}` : "",
      profile.cgpa ? `CGPA/GPA: ${profile.cgpa}` : "",
      profile.gradYear ? `Graduation year: ${profile.gradYear}` : "",
      typeof profile.age === "number" ? `Age: ${profile.age}` : "",
      profile.interestedCountries?.length
        ? `Interested in studying/working in: ${profile.interestedCountries.join(", ")}`
        : "",
      profile.interests?.length
        ? `Interests: ${profile.interests.join(", ")}`
        : "",
      profile.skills?.length ? `Skills: ${profile.skills.join(", ")}` : "",
      profile.goals?.length
        ? `Goals: ${profile.goals
            .map((goal) =>
              goal.description
                ? `${goal.title} — ${goal.description}`
                : goal.title,
            )
            .join("; ")}`
        : "",
    ].filter(Boolean);
    return lines.length ? lines.join("\n") : "No profile details available.";
  }

  // -------------------------------------------------------------------------
  // Deterministic fallbacks (the endpoint never 500s on provider outage)
  // -------------------------------------------------------------------------

  private buildFallbackKit(
    opportunity: OpportunityContext,
    profile: ProfileContext,
  ): KitContent {
    const checklist: KitContent["checklist"] = [];
    let index = 0;
    const push = (
      label: string,
      category: "documents" | "eligibility" | "preparation" | "submission",
      detail?: string,
    ) => {
      checklist.push({ id: `item-${index++}`, label, category, detail });
    };

    for (const requirement of opportunity.requirements.slice(0, 5)) {
      push(requirement, "eligibility");
    }
    push(
      "Update your CV for this opportunity",
      "documents",
      "Use the CV builder's tailor tool to align it with what this program values.",
    );
    push("Academic transcripts or proof of study", "documents");
    push(
      "Request recommendation letters early",
      "preparation",
      "Give referees at least two weeks and share the opportunity summary with them.",
    );
    push("Draft your personal statement / essays", "preparation");
    for (const step of opportunity.applicationProcess.slice(0, 3)) {
      push(step, "submission");
    }
    push(
      "Review everything, then submit before the deadline",
      "submission",
      opportunity.deadline
        ? `Deadline: ${new Date(opportunity.deadline).toDateString()}. Aim to submit at least 48 hours early.`
        : "Aim to submit at least 48 hours before the deadline.",
    );

    const focus = profile.major || profile.interests?.[0];
    const fitNote = [
      focus
        ? `Your background in ${focus} gives you a real story to tell here — lead with it.`
        : "Lead with the strongest, most specific story from your background.",
      `Reviewers for ${opportunity.category || "this kind of opportunity"} reward evidence over adjectives: name concrete results, numbers and outcomes.`,
    ].join(" ");

    return {
      fitNote,
      strategy: [
        "Mirror the opportunity's own language: repeat the exact skills and values named in its description.",
        "Quantify at least two achievements — numbers make reviewers stop skimming.",
        "Answer the question actually asked, not the essay you wish you could write.",
        "Get one person who doesn't know you well to read your draft — if they can't say what makes you different, rewrite.",
      ],
      checklist,
      essayPrompts: [
        {
          id: "why-you",
          prompt: `Why are you a strong candidate for ${opportunity.title}?`,
          guidance:
            "Reviewers want a specific, evidenced case — one clear theme backed by 2-3 concrete achievements.",
          suggestedAngle: focus
            ? `Anchor your case in your ${focus} experience and where you want to take it.`
            : "Anchor your case in your single strongest achievement.",
        },
        {
          id: "impact-goal",
          prompt:
            "Describe a challenge you have overcome and what it taught you about the impact you want to make.",
          guidance:
            "Show change over time: situation, what you did, what you'd do differently, and how it shapes your goals.",
          suggestedAngle:
            "Pick a challenge that connects naturally to this program's mission.",
        },
      ],
      // The heuristic fallback can't reason about eligibility/gaps honestly, so
      // it stays silent rather than guessing (both default to [] in the schema).
      eligibilityFlags: [],
      gaps: [],
    };
  }

  private buildFallbackOutline(
    opportunity: OpportunityContext,
    promptText: string,
  ): EssayOutline {
    return {
      thesis:
        "One clear theme — the specific strength that makes you the obvious pick — proven with concrete evidence.",
      hook: "Open inside a specific moment (a scene, a result, a decision), not with a definition or a quote.",
      sections: [
        {
          heading: "The hook: a concrete moment",
          points: [
            "Drop the reader into a specific scene that embodies your theme",
            "One or two sentences only — earn the right to explain later",
          ],
        },
        {
          heading: "Your evidence",
          points: [
            "Your 2-3 strongest achievements related to the prompt",
            "Quantify: numbers, scale, outcomes",
            `Connect each point back to what ${opportunity.title} is looking for`,
          ],
        },
        {
          heading: "Growth and self-awareness",
          points: [
            "What was hard, what you learned, what you'd do differently",
            "Reviewers trust candidates who can critique themselves",
          ],
        },
        {
          heading: "Why this opportunity, why now",
          points: [
            "Name specifics about the program — never 'prestigious opportunity'",
            "Show the straight line from this program to your next goal",
          ],
        },
        {
          heading: "Close the loop",
          points: [
            "Return to your opening moment with new meaning",
            "End on your future impact, not gratitude",
          ],
        },
      ],
      closing: "Circle back to your hook and point it at the future.",
      avoid: [
        "Opening with a dictionary definition or famous quote",
        "Listing achievements without a connecting theme",
        `Generic praise for the program that could apply to any ${opportunity.category || "opportunity"}`,
        `Ignoring part of the prompt: "${promptText.slice(0, 120)}"`,
      ],
    };
  }

  private buildFallbackFeedback(draft: string): EssayFeedback {
    const words = draft.trim().split(/\s+/).filter(Boolean);
    const paragraphs = draft
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0);
    const hasNumbers = /\d/.test(draft);
    const firstPerson = /\b(I|my|me)\b/i.test(draft);
    const cliches = [
      "ever since I was a child",
      "passionate about",
      "prestigious",
      "in today's world",
      "thinking outside the box",
    ].filter((phrase) => draft.toLowerCase().includes(phrase));

    const improvements: string[] = [];
    if (words.length < 150)
      improvements.push(
        "The draft is short — most statements need 300-600 words to build a real case.",
      );
    if (paragraphs.length < 3)
      improvements.push(
        "Break the draft into clear paragraphs: hook, evidence, growth, why-this-program, close.",
      );
    if (!hasNumbers)
      improvements.push(
        "Add at least two concrete numbers (people reached, results, rankings, durations) — evidence beats adjectives.",
      );
    if (!firstPerson)
      improvements.push(
        "Write in the first person — reviewers select a person, not an abstract.",
      );
    for (const phrase of cliches)
      improvements.push(
        `Replace the cliché "${phrase}" with something only you could write.`,
      );
    if (!improvements.length)
      improvements.push(
        "Tighten every sentence: cut filler words and make each paragraph earn its place.",
      );

    const clarity = Math.min(
      10,
      Math.max(3, Math.round(paragraphs.length * 2 + 2)),
    );
    const impact = hasNumbers ? 7 : 4;
    const authenticity = cliches.length
      ? Math.max(3, 7 - cliches.length * 2)
      : 7;

    return {
      overallScore: Math.min(
        88,
        Math.max(30, Math.round((clarity + impact + authenticity + 6) * 3.2)),
      ),
      scores: { clarity, relevance: 6, impact, authenticity },
      verdict:
        "Automated review (AI reviewer temporarily unavailable): structural feedback below — regenerate later for a full content critique.",
      strengths: [
        words.length >= 150
          ? "Substantial draft — you have material to shape."
          : "You've started — the hardest part is behind you.",
        firstPerson ? "Written in your own voice." : "Clear subject focus.",
      ],
      improvements,
      lineEdits: [],
      revisedOpening: undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async loadOpportunity(
    opportunityId: string,
  ): Promise<OpportunityContext> {
    const [row] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1)
      .execute();

    if (!row) throw new NotFoundException("Opportunity not found");

    const metadata = row.metadata ?? {};
    const list = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .map((item) => String(item))
            .filter(Boolean)
            .slice(0, 12)
        : [];

    return {
      id: row.id,
      title: row.title,
      summary: row.summary ?? null,
      description: row.description ?? null,
      organization: row.organization ?? null,
      category: row.canonicalCategory ?? row.category ?? null,
      deadline: row.deadline ?? null,
      eligibilityCriteria: row.eligibilityCriteria ?? null,
      fundingType: row.fundingType ?? null,
      targetRegion: row.targetRegion ?? null,
      imageUrl: row.imageUrl ?? null,
      applyUrl: row.applyUrl ?? row.applicationUrl ?? row.sourceUrl ?? null,
      location: row.location ?? null,
      type: row.type ?? null,
      eligibility:
        row.eligibility && typeof row.eligibility === "object"
          ? row.eligibility
          : null,
      requirements: list(metadata.requirements),
      benefits: list(metadata.benefits),
      applicationProcess: list(metadata.application_process),
    };
  }

  private async loadProfile(
    dbUserId: string,
    authId?: string,
  ): Promise<ProfileContext> {
    try {
      // Profiles are canonically keyed by the raw Clerk id (authId); dbUserId is
      // the derived uuid, which `matchProfileUserId` also matches — so when a
      // user has BOTH a populated raw row and an empty derived-uuid orphan,
      // Postgres could return the empty one. Read the raw row first; only fall
      // back to the dual-key match for legacy derived-only profiles.
      const goalRows = await db
        .select()
        .from(goalsTable)
        .where(eq(goalsTable.userId, dbUserId))
        .limit(3)
        .execute();
      let profileRows = authId
        ? await db
            .select()
            .from(profiles)
            .where(eq(profiles.userId, authId))
            .limit(1)
            .execute()
        : [];
      if (!profileRows.length) {
        profileRows = await db
          .select()
          .from(profiles)
          .where(matchProfileUserId(profiles.userId, dbUserId))
          .limit(1)
          .execute();
      }
      const row = profileRows[0];
      return {
        fullName: row?.fullName ?? undefined,
        country: row?.country ?? undefined,
        school: row?.school ?? undefined,
        major: row?.major ?? undefined,
        degree: row?.degree ?? undefined,
        age: row?.age ?? undefined,
        cgpa: row?.cgpa ?? undefined,
        gradYear: row?.gradYear ?? undefined,
        interests: row?.interests ?? undefined,
        skills: row?.skills ?? undefined,
        interestedCountries: row?.interestedCountries ?? undefined,
        goals: goalRows.map((goal) => ({
          title: goal.title,
          description: goal.description ?? undefined,
        })),
      };
    } catch (error) {
      this.logger.warn(
        `Copilot profile enrichment unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }

  private async findKit(userId: string, opportunityId: string) {
    this.assertUuid(opportunityId, "opportunity id");
    const dbUserId = this.requireUserId(userId);
    const [row] = await db
      .select()
      .from(applicationKits)
      .where(
        and(
          eq(applicationKits.userId, dbUserId),
          eq(applicationKits.opportunityId, opportunityId),
        ),
      )
      .limit(1)
      .execute();
    return row ?? null;
  }

  private async requireKit(dbUserId: string, opportunityId: string) {
    const [row] = await db
      .select()
      .from(applicationKits)
      .where(
        and(
          eq(applicationKits.userId, dbUserId),
          eq(applicationKits.opportunityId, opportunityId),
        ),
      )
      .limit(1)
      .execute();
    if (!row) {
      throw new NotFoundException(
        "Application kit not found — generate the kit first",
      );
    }
    return row;
  }

  private async withOpportunity(
    kitRow: ApplicationKit,
    opportunity: OpportunityContext,
  ) {
    return {
      ...kitRow,
      opportunity: {
        id: opportunity.id,
        title: opportunity.title,
        deadline: opportunity.deadline,
        organization: opportunity.organization,
        imageUrl: opportunity.imageUrl,
        category: opportunity.category,
        applyUrl: opportunity.applyUrl,
      },
    };
  }

  private resolvePromptText(
    kitRow: ApplicationKit,
    promptId: string,
    override?: string,
  ): string {
    if (override?.trim()) return override.trim();
    const kit = (kitRow.kit ?? {}) as Partial<KitContent>;
    const found = kit.essayPrompts?.find((entry) => entry.id === promptId);
    if (found?.prompt) return found.prompt;
    const essays = (kitRow.essays ?? []) as EssayWorkspaceEntry[];
    const existing = essays.find((entry) => entry.promptId === promptId);
    if (existing?.prompt) return existing.prompt;
    throw new BadRequestException("Unknown essay prompt — pass `prompt` text");
  }

  private async upsertEssayEntry(
    dbUserId: string,
    opportunityId: string,
    promptId: string,
    promptText: string,
    patch: Partial<Pick<EssayWorkspaceEntry, "outline" | "draft" | "feedback">>,
  ) {
    const kitRow = await this.requireKit(dbUserId, opportunityId);
    const essays = [...((kitRow.essays ?? []) as EssayWorkspaceEntry[])];
    const index = essays.findIndex((entry) => entry.promptId === promptId);
    const base: EssayWorkspaceEntry =
      index >= 0
        ? essays[index]
        : { promptId, prompt: promptText, updatedAt: new Date().toISOString() };

    const next: EssayWorkspaceEntry = {
      ...base,
      prompt: promptText || base.prompt,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (index >= 0) essays[index] = next;
    else essays.push(next);

    await db
      .update(applicationKits)
      .set({ essays, updatedAt: new Date() })
      .where(eq(applicationKits.id, kitRow.id));
  }

  /** Fallback ids for AI output that omitted them; keeps checklist state stable. */
  private ensureStableIds(content: KitContent) {
    content.checklist.forEach((item, index) => {
      if (!item.id) item.id = `item-${index}`;
    });
    content.essayPrompts.forEach((item, index) => {
      if (!item.id) item.id = `prompt-${index}`;
    });
  }

  /**
   * P2.3: on refresh, carry the previous kit's checklist item ids onto
   * regenerated items whose (case-insensitive, trimmed) label matches, so
   * preserved `checklistState` ticks keyed by those ids still line up. Each
   * previous id is reused at most once to avoid minting duplicate ids.
   */
  private carryOverChecklistIds(
    content: KitContent,
    previous: KitContent["checklist"],
  ) {
    if (!previous.length) return;
    const normalize = (label: string) => label.trim().toLowerCase();
    const previousIdByLabel = new Map<string, string>();
    for (const item of previous) {
      const key = normalize(item.label);
      if (item.id && !previousIdByLabel.has(key)) {
        previousIdByLabel.set(key, item.id);
      }
    }
    const used = new Set<string>();
    for (const item of content.checklist) {
      const previousId = previousIdByLabel.get(normalize(item.label));
      if (previousId && !used.has(previousId)) {
        item.id = previousId;
        used.add(previousId);
      }
    }
  }

  private requireUserId(userId: string): string {
    const dbUserId = toDatabaseUserId(userId);
    if (!dbUserId) throw new BadRequestException("Invalid user");
    return dbUserId;
  }

  private assertUuid(value: string, label: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
  }
}
