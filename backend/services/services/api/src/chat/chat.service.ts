import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AiService } from "../ai";

type ChatRole = "user" | "assistant" | "system";

type ChatThread = {
  id: string;
  title: string | null;
  updated_at: string;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

type OpportunityRow = {
  id: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  category?: string | null;
  deadline?: string | null;
  close_date?: string | null;
  organization?: string | null;
  location?: string | null;
  external_url?: string | null;
  application_url?: string | null;
  apply_url?: string | null;
  link?: string | null;
  image_url?: string | null;
  requirements?: string[] | null;
  skills?: string[] | null;
  benefits?: string[] | null;
  ai_match_score?: number;
  ai_match_reason?: string;
};

type OpportunityCard = {
  id: string;
  title: string;
  organization: string | null;
  category: string | null;
  location: string | null;
  deadline: string | null;
  summary: string | null;
  imageUrl: string | null;
  applyUrl: string | null;
  matchScore: number | null;
  matchReason: string | null;
};

type SmartAction = {
  id: string;
  type:
    | "view_opportunity"
    | "apply_opportunity"
    | "add_deadline"
    | "generate_roadmap"
    | "find_roadmap";
  label: string;
  opportunityId?: string;
  title?: string;
  deadline?: string | null;
  route?: string;
};

type CoachResponse = {
  message: string;
  followUpQuestions?: string[];
};

type CoachResponseJson = {
  message?: unknown;
  followUpQuestions?: unknown;
};

const EDUTU_TOPIC_REDIRECT =
  "I can help with scholarships, internships, fellowships, applications, CVs, deadlines, skills, and career planning. Tell me what kind of opportunity or next step you want help with.";

const MODEL_PROVIDER_PATTERN =
  /\b(deepseek|openai|chatgpt|gpt|gemini|claude|anthropic|large language model|language model|ai model)\b/gi;

@Injectable()
export class ChatService {
  private readonly supabase: SupabaseClient | null;

  constructor(private readonly aiService: AiService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  async listThreads(userId: string): Promise<{ threads: ChatThread[] }> {
    const supabase = this.requireSupabase();
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return { threads: (data ?? []) as ChatThread[] };
  }

  async listMessages(
    userId: string,
    threadId: string,
  ): Promise<{ messages: ChatMessage[] }> {
    const supabase = this.requireSupabase();
    await this.assertThreadOwner(supabase, userId, threadId);

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return { messages: (data ?? []) as ChatMessage[] };
  }

  async deleteThread(
    userId: string,
    threadId: string,
  ): Promise<{ success: true }> {
    const supabase = this.requireSupabase();
    const { error } = await supabase
      .from("chat_threads")
      .delete()
      .eq("id", threadId)
      .eq("user_id", userId);

    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  async sendMessage(
    userId: string,
    body: { threadId?: string | null; message?: string },
  ) {
    const message = body.message?.trim();
    if (!message) {
      throw new BadRequestException("Message is required");
    }

    const supabase = this.requireSupabase();
    await this.ensureProfile(supabase, userId);

    let threadId = body.threadId || null;
    if (threadId) {
      await this.assertThreadOwner(supabase, userId, threadId);
    } else {
      const { data: thread, error } = await supabase
        .from("chat_threads")
        .insert({
          user_id: userId,
          title: message.slice(0, 48),
        })
        .select("id")
        .single();

      if (error || !thread) {
        throw new BadRequestException(
          `Failed to create chat thread: ${error?.message || "Unknown error"}`,
        );
      }
      threadId = String(thread.id);
    }

    const wantsOpportunities = this.isOpportunityIntent(message);
    const wantsRoadmap = this.isRoadmapIntent(message);
    const needsOpportunityContext = wantsOpportunities || wantsRoadmap;
    const [{ data: profile }, { data: goals }, opportunitiesResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("country, field_of_study, education_level, interests, skills")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("goals")
          .select("title, deadline, progress")
          .eq("user_id", userId)
          .limit(5),
        needsOpportunityContext
          ? supabase
              .from("opportunities")
              .select(
                "id, title, summary, description, category, deadline, close_date, organization, location, external_url, application_url, apply_url, image_url, requirements, skills, benefits",
              )
              .eq("status", "active")
              .order("updated_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] }),
      ]);

    const isRelevantRequest = this.isEdutuRelevant(message);
    const rankedOpportunities = needsOpportunityContext
      ? this.rankOpportunities(
          ((opportunitiesResult.data ?? []) as OpportunityRow[]).slice(0, 10),
          (profile as Record<string, unknown> | null) ?? null,
          message,
        )
      : [];
    const topMatches = rankedOpportunities.slice(0, 5);

    let aiResult: Awaited<ReturnType<AiService["generateText"]>> | null = null;
    let finalAnswer = "";

    if (!isRelevantRequest) {
      finalAnswer = EDUTU_TOPIC_REDIRECT;
    } else {
      try {
        aiResult = await this.aiService.generateText({
          feature: "chat.coach",
          prompt: this.buildCoachPrompt({
            message,
            profile: (profile as Record<string, unknown> | null) ?? null,
            goals: (goals as Array<Record<string, unknown>> | null) ?? [],
            opportunities: topMatches,
            includeOpportunities: wantsOpportunities && topMatches.length > 0,
          }),
          systemInstruction:
            "You are Edutu Coach. Never mention model providers. Return concise JSON only.",
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 220,
          metadata: { source: "mobile-chat", userId },
        });
        finalAnswer = this.parseCoachResponse(aiResult.text || "").message;
      } catch (error) {
        console.error("Chat coach generation failed:", error);
      }
    }

    finalAnswer = this.sanitizeCoachMessage(
      finalAnswer ||
        (wantsRoadmap
          ? "Which opportunity should we build the roadmap for?\nSend the name, or open an opportunity and tap Roadmap."
          : this.buildFallbackAnswer(topMatches, wantsOpportunities)),
    );
    const opportunityCards = this.toOpportunityCards(topMatches);
    const attachCards = wantsOpportunities && opportunityCards.length > 0;
    const smartActions = attachCards
      ? this.toSmartActions(opportunityCards)
      : [];

    if (attachCards && this.looksLikeOpportunityDump(finalAnswer)) {
      finalAnswer = this.buildCardFirstAnswer(opportunityCards.length);
    }

    if (wantsRoadmap && this.looksLikeRoadmapDump(finalAnswer)) {
      finalAnswer = this.buildRoadmapFirstAnswer(topMatches.length > 0);
    }

    const { data: savedMessages, error: saveError } = await supabase
      .from("chat_messages")
      .insert([
        {
          thread_id: threadId,
          user_id: userId,
          role: "user",
          content: message,
          metadata: {},
        },
        {
          thread_id: threadId,
          user_id: userId,
          role: "assistant",
          content: finalAnswer,
          metadata: {
            intent: this.isOpportunityIntent(message)
              ? "opportunity_search"
              : "general",
            opportunities: attachCards ? opportunityCards : [],
            smartActions,
          },
        },
      ])
      .select("id, role, content, metadata, created_at");

    if (saveError || !savedMessages?.length) {
      throw new BadRequestException(
        `Failed to save chat messages: ${saveError?.message || "Unknown error"}`,
      );
    }

    await supabase
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    return {
      threadId,
      userMessage: savedMessages.find((item) => item.role === "user"),
      assistantMessage: savedMessages.find((item) => item.role === "assistant"),
      usage: {
        total_tokens: aiResult?.usage?.totalTokens,
        prompt_tokens: aiResult?.usage?.promptTokens,
        completion_tokens: aiResult?.usage?.completionTokens,
      },
    };
  }

  private async ensureProfile(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) return;

    const { error } = await supabase.from("profiles").insert({
      user_id: userId,
      full_name: "Edutu User",
    });

    if (error) throw new BadRequestException(error.message);
  }

  private async assertThreadOwner(
    supabase: SupabaseClient,
    userId: string,
    threadId: string,
  ) {
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException("Conversation not found");
  }

  private buildCoachPrompt(input: {
    message: string;
    profile: Record<string, unknown> | null;
    goals: Array<Record<string, unknown>>;
    opportunities: OpportunityRow[];
    includeOpportunities: boolean;
  }) {
    return `You are Edutu Coach, the in-app education and opportunity assistant for Edutu.

Identity and safety:
- Speak as Edutu Coach. Never mention DeepSeek, OpenAI, Gemini, model providers, or being a language model.
- Stay within education, scholarships, internships, fellowships, jobs, CVs, applications, roadmaps, skills, deadlines, and career growth.
- If the user is off-topic, briefly redirect to what Edutu can help with.

Response style:
- Return strict JSON only: {"message":"...", "followUpQuestions":["..."]}.
- Keep "message" very short: 8-25 words by default.
- Format "message" for mobile scanning: one short opening line, then at most 2 lines that start with "- " or "⭐ ".
- Never use asterisks.
- Do not paste long context. Do not use markdown headings.
- Give one next step. Avoid generic motivational filler.
- ${input.includeOpportunities ? "Do not list opportunity names, details, deadlines, or links in the message. The app renders real opportunity cards separately from INTERNAL OPPORTUNITIES." : "Do not recommend opportunities unless the user asks for them."}
- When opportunity cards are attached, write only a short intro and one action cue.
- For roadmap or application-plan requests: do not show opportunity lists. If the user has not named a specific opportunity, ask which opportunity to build the roadmap for. If they named one, confirm the deadline and say you can create a deadline-based plan with daily goals, checklist, resources, calendar items, and reminders.

${this.buildProfileContext(input.profile, input.goals)}

INTERNAL OPPORTUNITIES:
${this.buildOpportunityContext(input.opportunities)}

User request:
${input.message}`;
  }

  private parseCoachResponse(raw: string): CoachResponse {
    const trimmed = raw.trim();
    try {
      const parsed = JSON.parse(trimmed) as CoachResponseJson;
      const followUpQuestions = Array.isArray(parsed.followUpQuestions)
        ? parsed.followUpQuestions
            .filter((item): item is string => typeof item === "string")
            .slice(0, 3)
        : undefined;

      return {
        message: typeof parsed.message === "string" ? parsed.message : trimmed,
        followUpQuestions,
      };
    } catch {
      return { message: trimmed };
    }
  }

  private sanitizeCoachMessage(message: string) {
    const withoutProvider = message
      .replace(/as an? [^,.!?]*(assistant|model)[,.!?]?\s*/gi, "")
      .replace(MODEL_PROVIDER_PATTERN, "Edutu Coach")
      .replace(/^#+\s*/gm, "")
      .replace(/\*/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return true;
        if (/^-{3,}$/.test(line)) return false;
        if (/^\|?[-\s|:]+$/.test(line)) return false;
        if (/^\|.*\|$/.test(line)) return false;
        if (/^#+\s*/.test(line)) return false;
        return true;
      })
      .join("\n")
      .trim();

    const paragraphs = withoutProvider
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);

    const compact = paragraphs.join("\n");
    if (compact.length <= 360) {
      return compact;
    }

    return `${compact.slice(0, 357).trim()}...`;
  }

  private buildCardFirstAnswer(cardCount: number) {
    return [
      `I found ${cardCount} matching opportunities.`,
      "- Tap a card for details.",
      "⭐ Use Apply, Add deadline, or Roadmap.",
    ].join("\n");
  }

  private buildRoadmapFirstAnswer(hasMatches: boolean) {
    return hasMatches
      ? "I found a possible match.\nTap Build to create goals and reminders."
      : "Which opportunity is this for?\nSend the name or browse Opportunities.";
  }

  private looksLikeOpportunityDump(message: string) {
    return (
      /\|\s*opportunity\s*\|/i.test(message) ||
      /featured opportunities/i.test(message) ||
      /quick summary/i.test(message) ||
      message.length > 650
    );
  }

  private looksLikeRoadmapDump(message: string) {
    return (
      /personalized application roadmap/i.test(message) ||
      /step\s*\d+/i.test(message) ||
      /phase\s*\d+/i.test(message) ||
      /action item/i.test(message) ||
      /foundation\s*\(/i.test(message) ||
      message.length > 220
    );
  }

  private buildProfileContext(
    profile: Record<string, unknown> | null,
    goals: Array<Record<string, unknown>>,
  ) {
    if (!profile && !goals.length) {
      return "No stored profile or goals found.";
    }

    const profileLines = profile
      ? [
          `- Country: ${this.toSafeText(profile.country, "Not specified")}`,
          `- Field of study: ${this.toSafeText(profile.field_of_study, "Not specified")}`,
          `- Education level: ${this.toSafeText(profile.education_level, "Not specified")}`,
          `- Interests: ${Array.isArray(profile.interests) ? profile.interests.join(", ") : "Not specified"}`,
          `- Skills: ${Array.isArray(profile.skills) ? profile.skills.join(", ") : "Not specified"}`,
        ]
      : ["No profile available."];

    const goalLines = goals.length
      ? goals.map(
          (goal) =>
            `- ${this.toSafeText(goal.title, "Untitled goal")} (progress: ${this.toSafeText(goal.progress, "0")}%, deadline: ${this.toSafeText(goal.deadline, "not set")})`,
        )
      : ["No goals set."];

    return `USER PROFILE:\n${profileLines.join("\n")}\n\nUSER GOALS:\n${goalLines.join("\n")}`;
  }

  private buildOpportunityContext(opportunities: OpportunityRow[]) {
    if (!opportunities.length) {
      return "No matching internal opportunities were found.";
    }

    return opportunities
      .map((opportunity, index) =>
        [
          `${index + 1}. ${opportunity.title}`,
          `   - Category: ${opportunity.category || "General"}`,
          `   - Organization: ${opportunity.organization || "Edutu"}`,
          `   - Location: ${opportunity.location || "Remote / Not specified"}`,
          `   - Deadline: ${this.getOpportunityDeadline(opportunity) || "Not specified"}`,
          `   - Apply: ${this.getOpportunityApplyUrl(opportunity) || "No application link stored"}`,
          `   - Description: ${(opportunity.summary || opportunity.description || "No description available.").slice(0, 180)}`,
        ].join("\n"),
      )
      .join("\n\n");
  }

  private rankOpportunities(
    opportunities: OpportunityRow[],
    profile: Record<string, unknown> | null,
    message: string,
  ) {
    const searchTerms = [
      ...String(message || "")
        .toLowerCase()
        .split(/\W+/)
        .filter(Boolean),
      ...(Array.isArray(profile?.interests)
        ? profile.interests.map((value) => String(value).toLowerCase())
        : []),
      ...(Array.isArray(profile?.skills)
        ? profile.skills.map((value) => String(value).toLowerCase())
        : []),
      this.toSafeText(profile?.field_of_study, "").toLowerCase(),
    ].filter(Boolean);

    return [...opportunities]
      .map((opportunity) => {
        const haystack = [
          opportunity.title,
          opportunity.description,
          opportunity.category,
          opportunity.organization,
          opportunity.location,
          ...(opportunity.skills || []),
          ...(opportunity.requirements || []),
          ...(opportunity.benefits || []),
        ]
          .join(" ")
          .toLowerCase();

        const score = searchTerms.reduce(
          (total, term) => total + (haystack.includes(term) ? 1 : 0),
          0,
        );
        return {
          ...opportunity,
          ai_match_score: score,
          ai_match_reason: score > 0 ? "Matches your request or profile." : "",
        };
      })
      .sort((a, b) => (b.ai_match_score || 0) - (a.ai_match_score || 0))
      .slice(0, 5);
  }

  private buildFallbackAnswer(
    topMatches: OpportunityRow[],
    wantsOpportunities: boolean,
  ) {
    if (!wantsOpportunities || !topMatches.length) {
      return "I can help with that. Share your goal, field, country, education level, and deadline window, and I will give you a focused next step.";
    }

    return this.buildCardFirstAnswer(Math.min(topMatches.length, 4));
  }

  private toOpportunityCards(
    opportunities: OpportunityRow[],
  ): OpportunityCard[] {
    return opportunities
      .filter((opportunity) => opportunity.id && opportunity.title)
      .slice(0, 4)
      .map((opportunity) => ({
        id: String(opportunity.id),
        title: String(opportunity.title),
        organization: opportunity.organization || null,
        category: opportunity.category || null,
        location: opportunity.location || null,
        deadline: this.getOpportunityDeadline(opportunity),
        summary: opportunity.summary
          ? String(opportunity.summary).slice(0, 180)
          : opportunity.description
            ? String(opportunity.description).slice(0, 180)
            : null,
        imageUrl: opportunity.image_url || null,
        applyUrl: this.getOpportunityApplyUrl(opportunity),
        matchScore:
          typeof opportunity.ai_match_score === "number"
            ? opportunity.ai_match_score
            : null,
        matchReason: opportunity.ai_match_reason || null,
      }));
  }

  private toSmartActions(cards: OpportunityCard[]): SmartAction[] {
    return cards.flatMap((card) => {
      const actions: SmartAction[] = [
        {
          id: `view-${card.id}`,
          type: "view_opportunity",
          label: "View details",
          opportunityId: card.id,
          title: card.title,
          route: `/opportunities/${card.id}`,
        },
        {
          id: `roadmap-${card.id}`,
          type: "generate_roadmap",
          label: "Generate roadmap",
          opportunityId: card.id,
          title: card.title,
          route: `/opportunities/${card.id}`,
        },
        {
          id: `find-roadmap-${card.id}`,
          type: "find_roadmap",
          label: "Find roadmap",
          opportunityId: card.id,
          title: card.title,
          route: "/roadmaps",
        },
      ];

      if (card.deadline) {
        actions.unshift({
          id: `deadline-${card.id}`,
          type: "add_deadline",
          label: "Add deadline",
          opportunityId: card.id,
          title: card.title,
          deadline: card.deadline,
        });
      }

      return actions;
    });
  }

  private isOpportunityIntent(message: string) {
    const normalized = message.toLowerCase();
    if (this.isRoadmapIntent(normalized)) return false;
    return [
      /\b(show|find|get|recommend|list|suggest|available|matching|trending)\b.*\b(scholarships?|opportunities?|internships?|fellowships?|grants?|jobs?)\b/i,
      /\b(scholarships?|opportunities?|internships?|fellowships?|grants?|jobs?)\b.*\b(show|find|get|recommend|list|suggest|available|matching|trending)\b/i,
      /\b(mastercard)\b.*\b(opportunities?|scholarships?|matches|available)\b/i,
    ].some((pattern) => pattern.test(normalized));
  }

  private isRoadmapIntent(message: string) {
    const normalized = message.toLowerCase();
    return [
      /\broadmap\b/i,
      /\b(plan|prepare|timeline|schedule)\b.*\b(apply|application|opportunity|scholarship)\b/i,
      /\bbuild\b.*\b(plan|roadmap)\b/i,
    ].some((pattern) => pattern.test(normalized));
  }

  private isEdutuRelevant(message: string) {
    const normalized = message.toLowerCase();
    return [
      "scholarship",
      "opportunity",
      "apply",
      "application",
      "deadline",
      "grant",
      "fellowship",
      "internship",
      "job",
      "career",
      "program",
      "funding",
      "visa",
      "study",
      "school",
      "university",
      "college",
      "course",
      "cv",
      "resume",
      "cover letter",
      "essay",
      "sop",
      "personal statement",
      "skill",
      "roadmap",
      "mentor",
      "interview",
      "networking",
      "education",
      "admission",
      "learn",
    ].some((term) => normalized.includes(term));
  }

  private getOpportunityApplyUrl(opportunity: Partial<OpportunityRow>) {
    return (
      opportunity.external_url ||
      opportunity.application_url ||
      opportunity.apply_url ||
      opportunity.link ||
      null
    );
  }

  private getOpportunityDeadline(opportunity: Partial<OpportunityRow>) {
    return opportunity.deadline || opportunity.close_date || null;
  }

  private toSafeText(value: unknown, fallback: string) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return fallback;
  }

  private requireSupabase(): SupabaseClient {
    if (!this.supabase) {
      throw new InternalServerErrorException("Supabase is not configured");
    }
    return this.supabase;
  }
}
