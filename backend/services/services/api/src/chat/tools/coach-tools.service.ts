import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { userAiMemories } from "../../db/schema";
import { OpportunityRankingService } from "../../opportunities/opportunity-ranking.service";
import { ProfileService } from "../../profile/profile.service";
import { GoalsService } from "../../goals/goals.service";
import { RoadmapsService } from "../../roadmaps/roadmaps.service";
import { MonetizationService } from "../../monetization/monetization.service";
import { DocumentsService } from "../../documents/documents.service";
import { CvService } from "../../cv/cv.service";
import { OpportunityShareCardService } from "../../opportunities/opportunity-share-card.service";
import { ApplicationDocumentsService } from "../../applications/application-documents.service";
import { UploadsService } from "../../uploads/uploads.service";
import { AiService } from "../../ai";
import { AiToolDefinition } from "../../ai/ai.types";
import {
  ActionButton,
  CoachTool,
  CoachToolContext,
  DocumentCard,
} from "./coach-tool.types";
import { wrapUntrusted } from "../../common/untrusted-text";

const MAX_MEMORIES_PER_USER = 60;

/** Compact card the model sees — full rows would blow the context. */
function toToolOpportunity(row: Record<string, any>) {
  return {
    id: row.id,
    title: row.title,
    organization: row.organization ?? null,
    category: row.category ?? null,
    location: row.location ?? null,
    deadline:
      row.deadline instanceof Date
        ? row.deadline.toISOString().slice(0, 10)
        : (row.deadline ?? row.close_date ?? null),
    match: typeof row.match === "number" ? Math.round(row.match) : null,
    reasons: Array.isArray(row.match_reasons)
      ? row.match_reasons.slice(0, 2)
      : [],
    summary: (row.summary || row.description || "").toString().slice(0, 160),
  };
}

@Injectable()
export class CoachToolsService {
  private readonly logger = new Logger(CoachToolsService.name);
  private readonly tools: CoachTool[];

  constructor(
    private readonly rankingService: OpportunityRankingService,
    private readonly profileService: ProfileService,
    private readonly goalsService: GoalsService,
    private readonly roadmapsService: RoadmapsService,
    private readonly monetizationService: MonetizationService,
    private readonly documentsService: DocumentsService,
    private readonly cvService: CvService,
    private readonly shareCardService: OpportunityShareCardService,
    private readonly applicationDocs: ApplicationDocumentsService,
    private readonly uploads: UploadsService,
    private readonly aiService: AiService,
  ) {
    this.tools = [
      this.recommendOpportunities(),
      this.searchOpportunities(),
      this.spinOpportunity(),
      this.recordFeedback(),
      this.getUserProfile(),
      this.updateUserProfile(),
      this.saveMemory(),
      this.getUpcomingDeadlines(),
      this.createGoals(),
      this.createRoadmap(),
      this.offerRoadmap(),
      this.listDocuments(),
      this.draftCv(),
      this.draftSop(),
      this.editDocument(),
      this.exportDocument(),
      this.getOpportunityImage(),
      // Win-coach: applications, documents, fit.
      this.listApplications(),
      this.getApplicationStatus(),
      this.readDocument(),
      this.linkDocumentToApplication(),
      this.markSubmitted(),
      this.analyzeFit(),
    ];
  }

  getDefinitions(): AiToolDefinition[] {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Executes a model-requested tool call. Always resolves to a JSON string
   * for the tool message — errors become {"error": ...} so the model can
   * recover conversationally instead of the turn dying.
   */
  async execute(
    name: string,
    argsJson: string,
    ctx: CoachToolContext,
  ): Promise<string> {
    const tool = this.tools.find((candidate) => candidate.name === name);
    if (!tool) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    let rawArgs: unknown = {};
    try {
      rawArgs = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      return JSON.stringify({ error: "Tool arguments were not valid JSON" });
    }

    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      return JSON.stringify({
        error: `Invalid arguments: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      });
    }

    try {
      const result = await tool.execute(ctx, parsed.data);
      return JSON.stringify(result ?? { ok: true });
    } catch (error) {
      this.logger.warn(
        `coach tool ${name} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Tool failed",
      });
    }
  }

  // ─── Discovery tools ────────────────────────────────────────────────────

  private recommendOpportunities(): CoachTool<{
    limit?: number;
    query?: string;
    exclude_ids?: string[];
  }> {
    return {
      name: "recommend_opportunities",
      description:
        "Get opportunities personalized to this user (their profile, learned interests and behavior). Use for 'recommend for me', 'what fits me', or after feedback to fetch better matches. Returns ranked matches with a 0-100 match score and reasons.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "How many to return (1-8, default 5)",
          },
          query: {
            type: "string",
            description:
              "Optional focus, e.g. 'masters scholarships in Canada' — biases ranking toward it",
          },
          exclude_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Opportunity ids to exclude (e.g. ones the user just rejected)",
          },
        },
      },
      schema: z.object({
        limit: z.number().int().min(1).max(8).optional(),
        query: z.string().max(300).optional(),
        exclude_ids: z.array(z.string().uuid()).max(20).optional(),
      }),
      execute: async (ctx, args) => {
        const response = await this.rankingService.getRecommendationsForUser(
          ctx.userId,
          {
            limit: args.limit ?? 5,
            message: args.query,
            excludeOpportunityIds: args.exclude_ids,
          },
        );
        const rows = (response?.opportunities ?? []) as Array<
          Record<string, any>
        >;
        ctx.collectOpportunities(rows);
        return {
          opportunities: rows.map(toToolOpportunity),
          note: rows.length
            ? "The app shows these to the user as cards — mention the best one and why it fits, don't re-list them all."
            : "No matches — ask about their profile (country, interests) to improve results.",
        };
      },
    };
  }

  private searchOpportunities(): CoachTool<{ query: string; limit?: number }> {
    return {
      name: "search_opportunities",
      description:
        "Keyword-search the live opportunity catalog by title/organization/category. Use when the user names something specific ('Mastercard', 'internships in Lagos'). For personalized picks use recommend_opportunities instead.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search terms" },
          limit: { type: "number", description: "Max results (default 6)" },
        },
        required: ["query"],
      },
      schema: z.object({
        query: z.string().min(2).max(200),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async (ctx, args) => {
        const term = args.query.replace(/[%_,]/g, " ").trim();
        const { data } = await ctx.supabase
          .from("opportunities")
          .select(
            "id, title, summary, description, category, deadline, close_date, organization, location, image_url, application_url, apply_url",
          )
          .eq("status", "active")
          .or(
            `title.ilike.%${term}%,organization.ilike.%${term}%,category.ilike.%${term}%,summary.ilike.%${term}%`,
          )
          .order("updated_at", { ascending: false })
          .limit(args.limit ?? 6);
        const rows = (data ?? []) as Array<Record<string, any>>;
        ctx.collectOpportunities(rows);
        return {
          count: rows.length,
          opportunities: rows.map(toToolOpportunity),
        };
      },
    };
  }

  private spinOpportunity(): CoachTool<Record<string, unknown>> {
    return {
      name: "spin_opportunity",
      description:
        "Fun 'spin the wheel' — picks ONE surprise opportunity, weighted toward the user's best matches. Use for playful asks like 'spin me an opportunity' or 'surprise me'. Present it with energy.",
      parameters: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      execute: async (ctx) => {
        const response = await this.rankingService.getRecommendationsForUser(
          ctx.userId,
          { limit: 30 },
        );
        const rows = (response?.opportunities ?? []) as Array<
          Record<string, any>
        >;
        if (!rows.length) {
          return { error: "No opportunities available to spin" };
        }
        // Weighted random: match score + a floor so long-shots stay possible.
        const weights = rows.map((row) =>
          Math.max(5, typeof row.match === "number" ? row.match : 20),
        );
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let pick = Math.random() * total;
        let chosen = rows[0];
        for (let i = 0; i < rows.length; i += 1) {
          pick -= weights[i];
          if (pick <= 0) {
            chosen = rows[i];
            break;
          }
        }
        ctx.collectOpportunities([chosen]);
        ctx.collectActionButtons([
          {
            id: `spin-again-${Date.now()}`,
            kind: "spin_again",
            label: "Spin again 🎲",
            payload: {},
          },
        ]);
        return { spun: toToolOpportunity(chosen) };
      },
    };
  }

  private recordFeedback(): CoachTool<{
    opportunity_ids: string[];
    sentiment: "like" | "dislike";
    reason?: string;
  }> {
    return {
      name: "record_feedback",
      description:
        "Record the user's reaction to opportunities you showed ('I don't like these', 'love this one'). Dislikes teach the engine to avoid similar ones. After a dislike, call recommend_opportunities again with the rejected ids in exclude_ids.",
      parameters: {
        type: "object",
        properties: {
          opportunity_ids: {
            type: "array",
            items: { type: "string" },
            description: "The opportunity ids the user reacted to",
          },
          sentiment: { type: "string", enum: ["like", "dislike"] },
          reason: {
            type: "string",
            description:
              "Why, in the user's words (e.g. 'not into tech roles')",
          },
        },
        required: ["opportunity_ids", "sentiment"],
      },
      schema: z.object({
        opportunity_ids: z.array(z.string().uuid()).min(1).max(10),
        sentiment: z.enum(["like", "dislike"]),
        reason: z.string().max(300).optional(),
      }),
      execute: async (ctx, args) => {
        const signalType =
          args.sentiment === "like" ? "chat_like" : "chat_dislike";
        await Promise.allSettled(
          args.opportunity_ids.map((opportunityId) =>
            this.rankingService.recordSignal(ctx.userId, {
              opportunityId,
              signalType,
              signalValue: 1,
              source: "chat",
              context: args.reason?.slice(0, 200) || "chat_feedback",
            }),
          ),
        );
        if (args.sentiment === "dislike" && args.reason) {
          await this.insertMemory(ctx.userId, "dislike", args.reason, 0.8);
        }
        return {
          recorded: args.opportunity_ids.length,
          sentiment: args.sentiment,
        };
      },
    };
  }

  // ─── Profile & memory tools ─────────────────────────────────────────────

  private getUserProfile(): CoachTool<Record<string, unknown>> {
    return {
      name: "get_user_profile",
      description:
        "Read the user's profile (country, education, interests, skills). Check this before recommending when unsure what you know; missing_fields tells you what to ask for — ask ONE question at a time.",
      parameters: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      execute: async (ctx) => {
        const data = await this.resolveProfileRow(
          ctx,
          "full_name, country, school, major, degree, age, interests, skills, interested_countries",
        );
        const profile = data ?? {};
        const missing = [
          !profile.country && "country",
          !(profile.interests as string[] | null)?.length && "interests",
          !profile.degree && !profile.major && "education",
        ].filter(Boolean);
        return { profile, missing_fields: missing };
      },
    };
  }

  private updateUserProfile(): CoachTool<{
    country?: string;
    interests?: string[];
    skills?: string[];
    degree?: string;
    major?: string;
    age?: number;
    interested_countries?: string[];
  }> {
    return {
      name: "update_user_profile",
      description:
        "Save profile facts the user just told you (country, interests, skills, education, age, countries they want to study/work in). Saving immediately improves their recommendations — always save before re-recommending. Arrays REPLACE the stored value, so merge with what get_user_profile returned.",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string" },
          interests: { type: "array", items: { type: "string" } },
          skills: { type: "array", items: { type: "string" } },
          degree: { type: "string" },
          major: { type: "string" },
          age: { type: "number" },
          interested_countries: { type: "array", items: { type: "string" } },
        },
      },
      schema: z.object({
        country: z.string().min(2).max(120).optional(),
        interests: z.array(z.string().min(1).max(120)).max(30).optional(),
        skills: z.array(z.string().min(1).max(120)).max(30).optional(),
        degree: z.string().min(2).max(120).optional(),
        major: z.string().min(2).max(120).optional(),
        age: z.number().int().min(10).max(120).optional(),
        interested_countries: z
          .array(z.string().min(2).max(120))
          .max(20)
          .optional(),
      }),
      execute: async (ctx, args) => {
        const patch: Record<string, unknown> = {};
        if (args.country) patch.country = args.country;
        if (args.interests?.length) patch.interests = args.interests;
        if (args.skills?.length) patch.skills = args.skills;
        if (args.degree) patch.degree = args.degree;
        if (args.major) patch.major = args.major;
        if (typeof args.age === "number") patch.age = args.age;
        if (args.interested_countries?.length) {
          patch.interestedCountries = args.interested_countries;
        }
        if (!Object.keys(patch).length) {
          return { error: "Nothing to save — pass at least one field" };
        }
        // ctx.userId is the derived id; updateProfile resolves the canonical
        // (raw-keyed) row via the dual-key matcher.
        await this.profileService.updateProfile(
          { id: ctx.userId },
          patch as never,
        );
        return {
          saved: Object.keys(patch),
          note: "Profile saved — recommendations now reflect it.",
        };
      },
    };
  }

  private saveMemory(): CoachTool<{
    kind: "interest" | "preference" | "dislike" | "fact" | "context";
    content: string;
  }> {
    return {
      name: "save_memory",
      description:
        "Remember a durable fact about the user for future conversations ('prefers fully-funded programs', 'applying with siblings', 'hates unpaid internships'). Don't save one-off small talk.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["interest", "preference", "dislike", "fact", "context"],
          },
          content: { type: "string", description: "The fact, one sentence" },
        },
        required: ["kind", "content"],
      },
      schema: z.object({
        kind: z.enum(["interest", "preference", "dislike", "fact", "context"]),
        content: z.string().min(4).max(300),
      }),
      execute: async (ctx, args) => {
        await this.insertMemory(ctx.userId, args.kind, args.content, 0.9);
        return { remembered: args.content };
      },
    };
  }

  private getUpcomingDeadlines(): CoachTool<Record<string, unknown>> {
    return {
      name: "get_upcoming_deadlines",
      description:
        "The user's active goals and in-flight applications with their deadlines — use to nudge, prioritize, or answer 'what should I focus on'.",
      parameters: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      execute: async (ctx) => {
        const [{ data: goals }, { data: applications }] = await Promise.all([
          ctx.supabase
            .from("goals")
            .select("id, title, deadline, target_date, progress, status")
            .eq("user_id", ctx.userId)
            .eq("status", "active")
            .order("target_date", { ascending: true })
            .limit(10),
          ctx.supabase
            .from("opportunity_applications")
            .select(
              "status, updated_at, opportunity:opportunities(id, title, close_date)",
            )
            .eq("user_id", ctx.userId)
            .order("updated_at", { ascending: false })
            .limit(10),
        ]);
        return { goals: goals ?? [], applications: applications ?? [] };
      },
    };
  }

  // ─── Creation tools (P2 one-click actions) ──────────────────────────────

  private createGoals(): CoachTool<{
    goals: Array<{
      title: string;
      description?: string;
      deadline?: string;
      priority?: "low" | "medium" | "high";
    }>;
    opportunity_id?: string;
  }> {
    return {
      name: "create_goals",
      description:
        "Create trackable goals for the user (server reminders at 7/3/1/0 days before each deadline + calendar sync for connected accounts; the app also offers device calendar/notifications). Confirm the user wants them before calling. Max 8 goals.",
      parameters: {
        type: "object",
        properties: {
          goals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                deadline: {
                  type: "string",
                  description: "YYYY-MM-DD",
                },
                priority: { type: "string", enum: ["low", "medium", "high"] },
              },
              required: ["title"],
            },
          },
          opportunity_id: {
            type: "string",
            description: "Set when the goals target a specific opportunity",
          },
        },
        required: ["goals"],
      },
      schema: z.object({
        goals: z
          .array(
            z.object({
              title: z.string().min(3).max(150),
              description: z.string().max(1000).optional(),
              deadline: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional(),
              priority: z.enum(["low", "medium", "high"]).optional(),
            }),
          )
          .min(1)
          .max(8),
        opportunity_id: z.string().uuid().optional(),
      }),
      execute: async (ctx, args) => {
        const created: Array<{ id: string; title: string; deadline?: string }> =
          [];
        for (const goal of args.goals) {
          const saved = await this.goalsService.create(ctx.userId, {
            title: goal.title,
            description: goal.description,
            deadline: goal.deadline,
            targetDate: goal.deadline,
            priority: goal.priority ?? "medium",
            source: args.opportunity_id ? "imported" : "custom",
          } as never);
          created.push({
            id: (saved as { id: string }).id,
            title: goal.title,
            deadline: goal.deadline,
          });
        }
        ctx.collectDeviceActions([
          {
            type: "notifications.schedule",
            payload: { goals: created },
          },
          {
            type: "calendar.sync",
            payload: {
              title: args.opportunity_id
                ? "Edutu application plan"
                : "Edutu goals",
              milestones: created
                .filter((goal) => goal.deadline)
                .map((goal) => ({ title: goal.title, dueDate: goal.deadline })),
            },
          },
        ]);
        ctx.collectActionButtons([
          {
            id: `open-goals-${Date.now()}`,
            kind: "open_route",
            label: "View my goals",
            payload: { route: "/goals" },
          },
        ]);
        return {
          created,
          note: "Goals created with server reminders. The app will offer calendar + phone reminders.",
        };
      },
    };
  }

  private createRoadmap(): CoachTool<{
    opportunity_id: string;
    hours_per_week?: number;
  }> {
    return {
      name: "create_roadmap",
      description:
        "Build a personalized AI application roadmap for one opportunity (milestones with dates, strategy, requirement actions) and save it under the user's My Roadmaps. Costs credits — confirm the user wants it first.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
          hours_per_week: {
            type: "number",
            description: "How many hours/week the user can commit",
          },
        },
        required: ["opportunity_id"],
      },
      schema: z.object({
        opportunity_id: z.string().uuid(),
        hours_per_week: z.number().int().min(1).max(80).optional(),
      }),
      execute: async (ctx, args) => {
        // Metered like the HTTP roadmap endpoint; refunded if the build fails.
        const charge = await this.monetizationService.meter(
          ctx.userId,
          "roadmapGeneration",
        );
        try {
          const plan = await this.roadmapsService.generateOpportunityPlan(
            {
              opportunityId: args.opportunity_id,
              hoursPerWeek: args.hours_per_week,
            } as never,
            ctx.userId,
          );

          const { data: opportunity } = await ctx.supabase
            .from("opportunities")
            .select("id, title, organization, category, close_date, deadline")
            .eq("id", args.opportunity_id)
            .maybeSingle();
          const title = opportunity?.title || "Opportunity";
          const deadline =
            opportunity?.close_date || opportunity?.deadline || null;
          const datedMilestones = this.scheduleMilestones(
            plan.milestones,
            deadline,
          );

          const roadmap = await this.roadmapsService.createPersonal(
            {
              title: `${title} — application plan`,
              description: plan.summary || `AI application plan for ${title}`,
              category: "general",
              difficulty: "beginner",
              opportunityId: args.opportunity_id,
              version: 1,
              calendarSyncEnabled: false,
              isFeatured: false,
              steps: datedMilestones.map((milestone, index) => ({
                id: milestone.id || `m${index + 1}`,
                title: milestone.title,
                description: milestone.description,
                relativeDueDays: milestone.relativeDueDays,
                phase: "apply",
                taskType: "milestone",
              })),
              resources: [],
            } as never,
            ctx.userId,
          );

          ctx.collectDeviceActions([
            {
              type: "calendar.sync",
              payload: {
                title: `${title} — application plan`,
                deadline,
                milestones: datedMilestones.map((milestone) => ({
                  title: milestone.title,
                  dueDate: milestone.dueDate,
                })),
              },
            },
          ]);
          ctx.collectActionButtons([
            {
              id: `open-roadmap-${Date.now()}`,
              kind: "open_route",
              label: "Open my roadmap",
              payload: { route: "/roadmaps" },
            },
            {
              id: `goals-from-roadmap-${Date.now()}`,
              kind: "create_goals",
              label: "Turn milestones into goals",
              payload: {
                opportunity_id: args.opportunity_id,
                goals: datedMilestones.slice(0, 8).map((milestone) => ({
                  title: milestone.title,
                  description: milestone.description.slice(0, 300),
                  deadline: milestone.dueDate,
                })),
              },
            },
          ]);

          return {
            roadmap_id: (roadmap as { id?: string })?.id,
            summary: plan.summary,
            strategy: plan.winningStrategy,
            milestones: datedMilestones.map((milestone) => ({
              title: milestone.title,
              due: milestone.dueDate,
            })),
            note: "Saved under My Roadmaps. Present the plan briefly — the app links to the full roadmap.",
          };
        } catch (error) {
          await this.monetizationService.refund(charge);
          throw error;
        }
      },
    };
  }

  /**
   * Pure signal, no side effects: the model tells us the turn is about building
   * an application plan BEFORE anything is created, so the app can offer its
   * "Build roadmap" affordance.
   *
   * This exists because the alternative was the client (or the server) matching
   * English keywords against the message, which silently hid the affordance in
   * the app's 8 non-English locales. The model already understands every locale
   * it answers in, so asking it to raise the flag is both cheaper and correct.
   * It costs no credits and does nothing else.
   */
  private offerRoadmap(): CoachTool<{ opportunity_id?: string }> {
    return {
      name: "offer_roadmap",
      description:
        "Signal that a step-by-step application roadmap would help with what you are discussing, when you have NOT built one yet. Free and instant: it only makes the app show a 'Build roadmap' button under your reply. Call it (alongside your other tools, in any language the user writes in) whenever the user is planning, preparing or timing an application and a plan is the natural next step. Skip it only once create_roadmap has already SUCCEEDED this turn — the app already shows an 'Open my roadmap' button then, and re-offering to build one would risk a second, needless charge. If create_roadmap FAILED (e.g. insufficient credits), call this too so the user still gets a Build roadmap button to retry. Never mention this tool or the button.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: {
            type: "string",
            description: "The opportunity the plan would be for, if known",
          },
        },
      },
      schema: z.object({ opportunity_id: z.string().optional() }),
      execute: async () => ({
        ok: true,
        note: "Noted. Keep answering the user normally — do not mention this tool or any button.",
      }),
    };
  }

  // ─── Documents studio tools (P3) ─────────────────────────────────────────

  private documentToCard(document: {
    id: string;
    type: string;
    title: string;
    version: number;
  }): DocumentCard {
    return {
      docId: document.id,
      type: document.type as DocumentCard["type"],
      title: document.title,
      version: document.version,
    };
  }

  private listDocuments(): CoachTool<Record<string, unknown>> {
    return {
      name: "list_documents",
      description:
        "List the user's AI documents (CVs, SOPs, cover letters, essays) with their ids. Call this before edit_document/export_document when you don't already have the document id.",
      parameters: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      execute: async (ctx) => {
        const documents = await this.documentsService.list(ctx.userId);
        return { documents };
      },
    };
  }

  private draftCv(): CoachTool<{
    opportunity_id?: string;
    notes?: string;
  }> {
    return {
      name: "draft_cv",
      description:
        "Draft a complete, ATS-friendly CV from the user's profile, goals and (optionally) a target opportunity. Saves it as an editable document with a card in the app. Costs credits — confirm the user wants it first.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: {
            type: "string",
            description: "Target opportunity to angle the CV toward",
          },
          notes: {
            type: "string",
            description:
              "Anything the user said should be in it (roles, achievements, tone)",
          },
        },
      },
      schema: z.object({
        opportunity_id: z.string().uuid().optional(),
        notes: z.string().max(1000).optional(),
      }),
      execute: async (ctx, args) => {
        const charge = await this.monetizationService.meter(ctx.userId, "cvAi");
        try {
          let opportunityLine = "";
          let opportunityTitle: string | undefined;
          if (args.opportunity_id) {
            const { data: opportunity } = await ctx.supabase
              .from("opportunities")
              .select("title, organization, category, requirements, skills")
              .eq("id", args.opportunity_id)
              .maybeSingle();
            if (opportunity) {
              opportunityTitle = opportunity.title as string;
              opportunityLine = `Target opportunity: ${JSON.stringify(opportunity)}`;
            }
          }
          const draft = await this.cvService.generateDraft(ctx.userId, {
            prompt:
              [args.notes, opportunityLine].filter(Boolean).join("\n") ||
              undefined,
          });
          const document = await this.documentsService.createCvDocument(
            ctx.userId,
            draft.cv,
            {
              title: opportunityTitle
                ? `CV — ${opportunityTitle.slice(0, 90)}`
                : undefined,
              opportunityId: args.opportunity_id ?? null,
            },
          );
          ctx.collectDocuments([this.documentToCard(document)]);
          return {
            document_id: document.id,
            title: document.title,
            suggestions: draft.suggestions,
            note: "The app shows the CV as a card with export options. Mention 1-2 of the suggestions; the user can say things like 'make the summary punchier' to edit it.",
          };
        } catch (error) {
          await this.monetizationService.refund(charge);
          throw error;
        }
      },
    };
  }

  private draftSop(): CoachTool<{
    opportunity_id?: string;
    notes?: string;
  }> {
    return {
      name: "draft_sop",
      description:
        "Draft a Statement of Purpose (personal statement) using best-practice structure — hook, background, motivation & fit, goals, closing — grounded in the user's profile and a target opportunity. Saves it as an editable document. Costs credits — confirm first. Ask for the user's own notes/motivations before drafting if you have none; their voice makes it authentic.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: {
            type: "string",
            description: "The program/scholarship this SOP targets",
          },
          notes: {
            type: "string",
            description:
              "The user's own story, motivations, achievements — in their words",
          },
        },
      },
      schema: z.object({
        opportunity_id: z.string().uuid().optional(),
        notes: z.string().max(2000).optional(),
      }),
      execute: async (ctx, args) => {
        const charge = await this.monetizationService.meter(ctx.userId, "cvAi");
        try {
          const document = await this.documentsService.generateSop(ctx.userId, {
            opportunityId: args.opportunity_id ?? null,
            notes: args.notes,
          });
          ctx.collectDocuments([this.documentToCard(document)]);
          return {
            document_id: document.id,
            title: document.title,
            note: "Saved. The app shows it as a card with export options. Invite the user to read it and ask for changes in plain words.",
          };
        } catch (error) {
          await this.monetizationService.refund(charge);
          throw error;
        }
      },
    };
  }

  private editDocument(): CoachTool<{
    document_id: string;
    instruction: string;
  }> {
    return {
      name: "edit_document",
      description:
        "Apply the user's requested change to one of their documents ('shorten the summary', 'make the second paragraph about my volunteering'). Applies ONLY that change and bumps the version (previous version is kept).",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
          instruction: {
            type: "string",
            description: "The change to make, in plain words",
          },
        },
        required: ["document_id", "instruction"],
      },
      schema: z.object({
        document_id: z.string().uuid(),
        instruction: z.string().min(4).max(600),
      }),
      execute: async (ctx, args) => {
        const charge = await this.monetizationService.meter(
          ctx.userId,
          "copilotAssist",
        );
        try {
          const document = await this.documentsService.editDocument(
            ctx.userId,
            args.document_id,
            args.instruction,
          );
          ctx.collectDocuments([this.documentToCard(document)]);
          return {
            document_id: document.id,
            version: document.version,
            note: "Edit applied. Briefly say what changed.",
          };
        } catch (error) {
          await this.monetizationService.refund(charge);
          throw error;
        }
      },
    };
  }

  private exportDocument(): CoachTool<{
    document_id: string;
    format: "pdf" | "docx";
  }> {
    return {
      name: "export_document",
      description:
        "Export one of the user's documents as a well-named PDF or DOCX file and return a download link (valid 7 days). Free.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" },
          format: { type: "string", enum: ["pdf", "docx"] },
        },
        required: ["document_id", "format"],
      },
      schema: z.object({
        document_id: z.string().uuid(),
        format: z.enum(["pdf", "docx"]),
      }),
      execute: async (ctx, args) => {
        const document = await this.documentsService.get(
          ctx.userId,
          args.document_id,
        );
        const exported = await this.documentsService.exportDocument(
          ctx.userId,
          args.document_id,
          args.format,
        );
        ctx.collectDocuments([
          {
            ...this.documentToCard(document),
            url: exported.url,
            format: exported.format,
            fileName: exported.fileName,
          },
        ]);
        return {
          file_name: exported.fileName,
          format: exported.format,
          note: "The app shows a download card for the file — no need to paste the link.",
        };
      },
    };
  }

  private getOpportunityImage(): CoachTool<{ opportunity_id: string }> {
    return {
      name: "get_opportunity_image",
      description:
        "Get the shareable branded image (poster card) for an opportunity — for 'make me an image of this', 'give me something to share on WhatsApp/Instagram'. The app shows the image with share options.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
        },
        required: ["opportunity_id"],
      },
      schema: z.object({ opportunity_id: z.string().uuid() }),
      execute: async (ctx, args) => {
        const { data: opportunity } = await ctx.supabase
          .from("opportunities")
          .select("*")
          .eq("id", args.opportunity_id)
          .maybeSingle();
        if (!opportunity) return { error: "Opportunity not found" };
        const card = await this.shareCardService.ensureShareCardForOpportunity(
          opportunity as Record<string, any>,
        );
        if (!card?.url) {
          return { error: "Image generation is unavailable right now" };
        }
        ctx.collectImages([
          {
            opportunityId: args.opportunity_id,
            title: String(opportunity.title || "Opportunity"),
            url: card.url,
            format: card.format,
          },
        ]);
        return {
          image_ready: true,
          note: "The app shows the image with share options — just tell the user it's ready.",
        };
      },
    };
  }

  // ─── Win-coach tools (applications, documents, fit) ─────────────────────

  private listApplications(): CoachTool<Record<string, unknown>> {
    return {
      name: "list_applications",
      description:
        "The user's tracked applications with per-application document completeness (which required docs — CV, SOP — are still missing) and deadlines. Use for 'what have I applied to', 'what's left', or before advising on next steps.",
      parameters: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      execute: async (ctx) => {
        const applications = await this.applicationDocs.listForUser(ctx.userId);
        return {
          applications: applications.map((app) => ({
            application_id: app.applicationId,
            opportunity: app.opportunityTitle,
            status: app.status,
            deadline: app.deadline,
            missing_documents: app.missingRoles,
          })),
          note: applications.length
            ? "Point out the most urgent one (nearest deadline with missing docs) and offer the next step."
            : "No tracked applications yet — encourage the user to apply to a good match.",
        };
      },
    };
  }

  private getApplicationStatus(): CoachTool<{ application_id: string }> {
    return {
      name: "get_application_status",
      description:
        "One application's full status: its documents by role, which required documents are missing, the deadline, and whether it is submitted. Use before answering 'what's left for X' or 'am I ready to submit'.",
      parameters: {
        type: "object",
        properties: { application_id: { type: "string" } },
        required: ["application_id"],
      },
      schema: z.object({ application_id: z.string().uuid() }),
      execute: async (ctx, args) => {
        const status = await this.applicationDocs.getStatus(
          ctx.userId,
          args.application_id,
        );
        if (!status) return { error: "Application not found" };
        return {
          opportunity: status.opportunityTitle,
          status: status.status,
          deadline: status.deadline,
          documents: status.docs.map((doc) => ({
            role: doc.role,
            status: doc.status,
          })),
          missing_documents: status.missingRoles,
        };
      },
    };
  }

  private readDocument(): CoachTool<{
    upload_id?: string;
    document_id?: string;
  }> {
    return {
      name: "read_document",
      description:
        "Read the text of one of the user's documents so you can review or reason over it — either an uploaded file (upload_id, their real CV/essay) or an AI document (document_id). Pass exactly one id.",
      parameters: {
        type: "object",
        properties: {
          upload_id: {
            type: "string",
            description: "An uploaded file's id (user's real document)",
          },
          document_id: {
            type: "string",
            description: "An AI-generated document's id",
          },
        },
      },
      schema: z
        .object({
          upload_id: z.string().uuid().optional(),
          document_id: z.string().uuid().optional(),
        })
        .refine(
          (value) => Boolean(value.upload_id) !== Boolean(value.document_id),
          {
            message: "Pass exactly one of upload_id or document_id",
          },
        ),
      execute: async (ctx, args) => {
        if (args.upload_id) {
          const upload = await this.uploads.getExtractedText(
            ctx.userId,
            args.upload_id,
          );
          if (!upload) return { error: "Upload not found" };
          if (upload.parseStatus !== "done") {
            return {
              status: upload.parseStatus,
              note: "This upload has not been parsed yet — ask the user to re-upload if it stays unparsed.",
            };
          }
          return {
            source: "upload",
            file_name: upload.fileName,
            // Framed, not filtered: an uploaded CV is untrusted text reaching
            // an agent that holds mutating, credit-spending tools.
            text: wrapUntrusted(
              "UNTRUSTED_DOCUMENT",
              upload.text.slice(0, 6000),
            ),
          };
        }
        const document = await this.documentsService.get(
          ctx.userId,
          args.document_id as string,
        );
        if (!document) return { error: "Document not found" };
        return {
          source: "ai_document",
          title: document.title,
          text: wrapUntrusted(
            "UNTRUSTED_DOCUMENT",
            JSON.stringify(document.content).slice(0, 6000),
          ),
        };
      },
    };
  }

  private linkDocumentToApplication(): CoachTool<{
    application_id: string;
    role: "cv" | "sop" | "transcript" | "other";
    upload_id?: string;
    document_id?: string;
  }> {
    return {
      name: "link_document_to_application",
      description:
        "Attach a document (an uploaded file or an AI document) to one of the user's applications under a role (cv, sop, transcript, other). Records it as a draft attachment — use mark_submitted once they've actually sent it.",
      parameters: {
        type: "object",
        properties: {
          application_id: { type: "string" },
          role: {
            type: "string",
            enum: ["cv", "sop", "transcript", "other"],
          },
          upload_id: { type: "string" },
          document_id: { type: "string" },
        },
        required: ["application_id", "role"],
      },
      schema: z.object({
        application_id: z.string().uuid(),
        role: z.enum(["cv", "sop", "transcript", "other"]),
        upload_id: z.string().uuid().optional(),
        document_id: z.string().uuid().optional(),
      }),
      execute: async (ctx, args) => {
        const linked = await this.applicationDocs.linkDocument(ctx.userId, {
          applicationId: args.application_id,
          role: args.role,
          uploadId: args.upload_id,
          documentId: args.document_id,
        });
        return { linked: { role: linked.role, status: linked.status } };
      },
    };
  }

  private markSubmitted(): CoachTool<{
    application_id: string;
    role: "cv" | "sop" | "transcript" | "other";
  }> {
    return {
      name: "mark_submitted",
      description:
        "Record that the user submitted a document (by role: cv, sop, transcript, other) to one of their applications. When every required document is submitted the application is marked submitted — celebrate that.",
      parameters: {
        type: "object",
        properties: {
          application_id: { type: "string" },
          role: {
            type: "string",
            enum: ["cv", "sop", "transcript", "other"],
          },
        },
        required: ["application_id", "role"],
      },
      schema: z.object({
        application_id: z.string().uuid(),
        role: z.enum(["cv", "sop", "transcript", "other"]),
      }),
      execute: async (ctx, args) => {
        const row = await this.applicationDocs.markSubmitted(ctx.userId, {
          applicationId: args.application_id,
          role: args.role,
        });
        const status = await this.applicationDocs.getStatus(
          ctx.userId,
          args.application_id,
        );
        return {
          submitted_role: row.role,
          application_status: status?.status ?? "draft",
          still_missing: status?.missingRoles ?? [],
        };
      },
    };
  }

  /**
   * Resolve the user's canonical profile row. Profiles are keyed by the raw
   * Clerk id (ctx.profileUserId); ctx.userId is the derived DB uuid, which for
   * many users points at an empty orphan row. Query by both and prefer the
   * raw-keyed row so the agent grounds on real data.
   */
  private async resolveProfileRow(
    ctx: CoachToolContext,
    columns: string,
  ): Promise<Record<string, unknown> | null> {
    // The dual-key read this comment has always described, but which the
    // implementation never did — it queried a single key. `update_user_profile`
    // writes through ProfileService's dual-key matcher, so a row reachable by
    // writes was not necessarily reachable by reads: the coach could save an
    // answer and then still report the profile as empty. `.maybeSingle()` is
    // also wrong here, because it errors outright when both keyings exist.
    const lookupIds = Array.from(
      new Set([ctx.profileUserId, ctx.userId].filter(Boolean) as string[]),
    );
    if (!lookupIds.length) return null;

    const { data } = await ctx.supabase
      .from("profiles")
      .select(`user_id, ${columns}`)
      .in("user_id", lookupIds);

    // Through `unknown`: the column list is a runtime template string, so
    // PostgREST's compile-time select parser cannot infer a row shape for it.
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (!rows.length) return null;

    // Prefer the raw Clerk-keyed row: the uuid-keyed rows are empty orphans.
    return (
      rows.find((row) => row.user_id === ctx.profileUserId) ?? rows[0] ?? null
    );
  }

  private analyzeFit(): CoachTool<{
    opportunity_id: string;
    upload_id?: string;
  }> {
    return {
      name: "analyze_fit",
      description:
        "Analyze how well this user fits an opportunity — compares the opportunity's requirements against the user's profile and, if given, an uploaded document (their real CV/essay). Returns honest strengths, the biggest gaps, and concrete next actions to become competitive. Costs credits — confirm the user wants it first.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
          upload_id: {
            type: "string",
            description:
              "An uploaded document to ground the analysis in the user's real materials",
          },
        },
        required: ["opportunity_id"],
      },
      schema: z.object({
        opportunity_id: z.string().uuid(),
        upload_id: z.string().uuid().optional(),
      }),
      execute: async (ctx, args) => {
        const charge = await this.monetizationService.meter(
          ctx.userId,
          "copilotAssist",
        );
        try {
          const { data: opportunity } = await ctx.supabase
            .from("opportunities")
            .select(
              "title, organization, category, requirements, eligibility, skills, deadline, close_date",
            )
            .eq("id", args.opportunity_id)
            .maybeSingle();
          if (!opportunity) return { error: "Opportunity not found" };

          // How much runway is left. Without this the model returned a generic
          // to-do list — "retake IELTS", "get two references" — with no sense
          // of whether there were three weeks or three days to do it in, which
          // is the difference between a plan and a wish.
          const deadlineRaw =
            (opportunity as Record<string, unknown>).deadline ??
            (opportunity as Record<string, unknown>).close_date ??
            null;
          const deadlineMs =
            typeof deadlineRaw === "string" ? Date.parse(deadlineRaw) : NaN;
          const daysLeft = Number.isFinite(deadlineMs)
            ? Math.ceil((deadlineMs - Date.now()) / (24 * 60 * 60 * 1000))
            : null;
          const runwayLine =
            daysLeft === null
              ? "DEADLINE: none published — treat as evergreen, but do not stall."
              : daysLeft < 0
                ? `DEADLINE: CLOSED ${Math.abs(daysLeft)} days ago. Say so plainly and point at what to prepare for the next cycle instead.`
                : `DEADLINE: ${daysLeft} day(s) away. Every next action must be completable in that window, ordered soonest-first; if a gap cannot realistically be closed in time, say that honestly rather than listing it as an action.`;

          const profile = await this.resolveProfileRow(
            ctx,
            "country, major, degree, interests, skills, age",
          );

          let uploadText = "";
          if (args.upload_id) {
            const upload = await this.uploads.getExtractedText(
              ctx.userId,
              args.upload_id,
            );
            uploadText = upload?.text?.slice(0, 6000) ?? "";
          }

          const analysis = await this.aiService.generateJson<{
            strengths?: string[];
            gaps?: string[];
            nextActions?: string[];
            verdict?: string;
          }>({
            feature: "copilot.kit",
            userId: ctx.userId,
            prompt: [
              "Assess how competitive this user is for the opportunity. Be honest and specific — no flattery, no fabrication. Ground every point ONLY in the data provided; if something is unknown, treat it as a gap, don't invent it.",
              `OPPORTUNITY: ${JSON.stringify(opportunity)}`,
              runwayLine,
              `USER PROFILE: ${profile ? JSON.stringify(profile) : "Unknown"}`,
              uploadText
                ? `USER DOCUMENT (their real CV/essay):\n${wrapUntrusted(
                    "UNTRUSTED_DOCUMENT",
                    uploadText,
                  )}`
                : "USER DOCUMENT: none provided.",
              'Return JSON: {"verdict":"one-line honest summary","strengths":["..."],"gaps":["..."],"nextActions":["concrete step",...]} — at most 4 items per list.',
            ].join("\n\n"),
            metadata: {
              source: "analyze-fit",
              ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
            },
          });

          return {
            verdict: analysis?.verdict ?? "",
            strengths: (analysis?.strengths ?? []).slice(0, 4),
            gaps: (analysis?.gaps ?? []).slice(0, 4),
            next_actions: (analysis?.nextActions ?? []).slice(0, 4),
            days_left: daysLeft,
            note: "Give the verdict, the single biggest gap, and one next action. Lead with the deadline when it is close. Offer to build a roadmap or draft the missing document.",
          };
        } catch (error) {
          await this.monetizationService.refund(charge);
          throw error;
        }
      },
    };
  }

  /**
   * Spreads narrative milestones across the runway (today → deadline minus a
   * 3-day submission buffer). No deadline = weekly cadence.
   */
  private scheduleMilestones(
    milestones: Array<{ id: string; title: string; description: string }>,
    deadline: string | null,
  ) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const deadlineMs = deadline ? Date.parse(deadline) : NaN;
    const runwayDays =
      Number.isFinite(deadlineMs) && deadlineMs > now
        ? Math.max(3, Math.floor((deadlineMs - now) / dayMs) - 3)
        : milestones.length * 7;
    return milestones.map((milestone, index) => {
      const relativeDueDays = Math.max(
        1,
        Math.round(((index + 1) / milestones.length) * runwayDays),
      );
      return {
        ...milestone,
        relativeDueDays,
        dueDate: new Date(now + relativeDueDays * dayMs)
          .toISOString()
          .slice(0, 10),
      };
    });
  }

  private async insertMemory(
    userId: string,
    kind: string,
    content: string,
    confidence: number,
  ) {
    await db.insert(userAiMemories).values({
      userId,
      kind,
      content: content.slice(0, 400),
      source: "chat",
      confidence,
    });
    // FIFO cap so a chatty user can't grow an unbounded prompt.
    await db.execute(sql`
      delete from user_ai_memories
      where user_id = ${userId}
        and id not in (
          select id from user_ai_memories
          where user_id = ${userId}
          order by last_used_at desc
          limit ${MAX_MEMORIES_PER_USER}
        )
    `);
  }

  /** Entry point for the post-turn extraction job (lower confidence than explicit saves). */
  async saveExtractedMemory(userId: string, kind: string, content: string) {
    await this.insertMemory(userId, kind, content, 0.6);
  }

  /** Loads the freshest memories for prompt injection and stamps usage. */
  async loadMemories(userId: string, limit = 12) {
    const rows = await db
      .select({
        id: userAiMemories.id,
        kind: userAiMemories.kind,
        content: userAiMemories.content,
      })
      .from(userAiMemories)
      .where(eq(userAiMemories.userId, userId))
      .orderBy(desc(userAiMemories.lastUsedAt))
      .limit(limit)
      .execute();
    if (rows.length) {
      void db
        .execute(
          sql`update user_ai_memories set last_used_at = now() where id in ${sql.raw(
            `(${rows.map((row) => `'${row.id}'`).join(",")})`,
          )}`,
        )
        .catch(() => undefined);
    }
    return rows;
  }
}
