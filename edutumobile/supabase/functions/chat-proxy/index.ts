import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { verifyClerkRequest } from "../_shared/clerk-auth.ts";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_AUDIO_BASE64_BYTES = 6 * 1024 * 1024;

function checkRateLimit(userId: string, maxRequests = 100, windowMs = 3600000): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(userId);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (limit.count >= maxRequests) {
    return false;
  }

  limit.count++;
  return true;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

type OpportunityRow = {
  id: string;
  title: string;
  summary?: string | null;
  description: string | null;
  category: string | null;
  deadline: string | null;
  close_date?: string | null;
  organization: string | null;
  location: string | null;
  external_url: string | null;
  application_url?: string | null;
  apply_url?: string | null;
  image_url?: string | null;
  requirements: string[] | null;
  skills: string[] | null;
  benefits: string[] | null;
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
  type: "view_opportunity" | "apply_opportunity" | "add_deadline" | "generate_roadmap" | "find_roadmap";
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

type AudioPayload = {
  mimeType: string;
  data: string;
};

const EDUTU_TOPIC_REDIRECT =
  "I can help with scholarships, internships, fellowships, applications, CVs, deadlines, skills, and career planning. Tell me what kind of opportunity or next step you want help with.";

const MODEL_PROVIDER_PATTERN =
  /\b(deepseek|openai|chatgpt|gpt|gemini|claude|anthropic|large language model|language model|ai model)\b/gi;

const DEEPSEEK_API_URL =
  Deno.env.get("DEEPSEEK_API_URL") || "https://api.deepseek.com/chat/completions";
const OPENAI_AUDIO_TRANSCRIBE_URL =
  Deno.env.get("OPENAI_AUDIO_TRANSCRIBE_URL") || "https://api.openai.com/v1/audio/transcriptions";

async function callDeepSeek(apiKey: string, prompt: string, responseMimeType?: string) {
  return callDeepSeekWithParts(apiKey, [{ text: prompt }], responseMimeType);
}

async function callDeepSeekWithParts(
  apiKey: string,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  responseMimeType?: string,
) {
  const hasInlineData = parts.some((part) => Boolean(part.inlineData));
  if (hasInlineData) {
    throw new Error("DeepSeek chat endpoint does not support inline audio inputs.");
  }

  const messages = parts
    .filter((part): part is { text: string } => typeof part.text === 'string')
    .map((part) => ({
      role: 'user',
      content: part.text,
    }));

  const response = await fetch(
    DEEPSEEK_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat",
        messages,
        temperature: 0.2,
        ...(responseMimeType ? { response_format: { type: "json_object" } } : {}),
      }),
    },
  );

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${failureText}`);
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim() || "";
}

async function callDeepSeekJson(apiKey: string, prompt: string) {
  const text = await callDeepSeek(apiKey, prompt, "application/json");
  try {
    return JSON.parse(text);
  } catch {
    console.error("Failed to parse DeepSeek JSON output:", text);
    return { matches: [] };
  }
}

function parseCoachResponse(raw: string): CoachResponse {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return {
      message: typeof parsed?.message === "string" ? parsed.message : trimmed,
      followUpQuestions: Array.isArray(parsed?.followUpQuestions)
        ? parsed.followUpQuestions.filter((item: unknown) => typeof item === "string").slice(0, 3)
        : undefined,
    };
  } catch {
    return { message: trimmed };
  }
}

function sanitizeCoachMessage(message: string) {
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

function buildCardFirstAnswer(cardCount: number) {
  return [
    `I found ${cardCount} matching opportunities.`,
    "- Tap a card for details.",
    "⭐ Use Apply, Add deadline, or Roadmap.",
  ].join("\n");
}

function buildRoadmapFirstAnswer(hasMatches: boolean) {
  return hasMatches
    ? "I found a possible match.\nTap Build to create goals and reminders."
    : "Which opportunity is this for?\nSend the name or browse Opportunities.";
}

function looksLikeOpportunityDump(message: string) {
  return (
    /\|\s*opportunity\s*\|/i.test(message) ||
    /featured opportunities/i.test(message) ||
    /quick summary/i.test(message) ||
    message.length > 650
  );
}

function looksLikeRoadmapDump(message: string) {
  return (
    /personalized application roadmap/i.test(message) ||
    /step\s*\d+/i.test(message) ||
    /phase\s*\d+/i.test(message) ||
    /action item/i.test(message) ||
    /foundation\s*\(/i.test(message) ||
    message.length > 220
  );
}

async function transcribeAudio(apiKey: string, audio: AudioPayload) {
  const audioBytes = Uint8Array.from(atob(audio.data), (char) => char.charCodeAt(0));
  const audioBlob = new Blob([audioBytes], { type: audio.mimeType });
  const audioFile = new File([audioBlob], `voice-note.${audio.mimeType.split('/')[1] || 'm4a'}`, {
    type: audio.mimeType,
  });

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", Deno.env.get("OPENAI_AUDIO_MODEL") || "whisper-1");

  const response = await fetch(OPENAI_AUDIO_TRANSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI transcription failed: ${response.status} ${failureText}`);
  }

  const payload = await response.json();
  const transcript = String(payload?.text || payload?.transcript || "").trim();

  return transcript;
}

function buildProfileContext(profile: Record<string, unknown> | null, goals: Array<Record<string, unknown>> | null) {
  if (!profile && !goals?.length) {
    return "No stored profile or goals found.";
  }

  const profileLines = profile ? [
    `- Country: ${String(profile.country || "Not specified")}`,
    `- Field of study: ${String(profile.field_of_study || "Not specified")}`,
    `- Education level: ${String(profile.education_level || "Not specified")}`,
    `- Interests: ${Array.isArray(profile.interests) ? profile.interests.join(", ") : "Not specified"}`,
    `- Skills: ${Array.isArray(profile.skills) ? profile.skills.join(", ") : "Not specified"}`,
  ] : ["No profile available."];

  const goalLines = goals?.length
    ? goals.map((goal) => `- ${String(goal.title || "Untitled goal")} (progress: ${String(goal.progress ?? 0)}%, deadline: ${String(goal.deadline || "not set")})`)
    : ["No goals set."];

  return `USER PROFILE:\n${profileLines.join("\n")}\n\nUSER GOALS:\n${goalLines.join("\n")}`;
}

function buildOpportunityContext(opportunities: OpportunityRow[]) {
  if (!opportunities.length) {
    return "No matching internal opportunities were found.";
  }

  return opportunities.map((opportunity, index) => {
    return [
      `${index + 1}. ${opportunity.title}`,
      `   - Category: ${opportunity.category || "General"}`,
      `   - Organization: ${opportunity.organization || "Edutu"}`,
      `   - Location: ${opportunity.location || "Remote / Not specified"}`,
      `   - Deadline: ${opportunity.deadline || opportunity.close_date || "Not specified"}`,
      `   - Skills: ${opportunity.skills?.join(", ") || "Not specified"}`,
      `   - Requirements: ${opportunity.requirements?.join(", ") || "Not specified"}`,
      `   - Benefits: ${opportunity.benefits?.join(", ") || "Not specified"}`,
      `   - Apply: ${getOpportunityApplyUrl(opportunity) || "No application link stored"}`,
      `   - Description: ${(opportunity.summary || opportunity.description || "No description available.").slice(0, 500)}`,
    ].join("\n");
  }).join("\n\n");
}

function getOpportunityApplyUrl(opportunity: Partial<OpportunityRow>) {
  return opportunity.external_url || opportunity.application_url || opportunity.apply_url || null;
}

function getOpportunityDeadline(opportunity: Partial<OpportunityRow>) {
  return opportunity.deadline || opportunity.close_date || null;
}

function toOpportunityCards(opportunities: Array<OpportunityRow & Record<string, unknown>>): OpportunityCard[] {
  return opportunities
    .filter((opportunity) => opportunity.id && opportunity.title)
    .slice(0, 4)
    .map((opportunity) => ({
      id: String(opportunity.id),
      title: String(opportunity.title),
      organization: opportunity.organization ? String(opportunity.organization) : null,
      category: opportunity.category ? String(opportunity.category) : null,
      location: opportunity.location ? String(opportunity.location) : null,
      deadline: getOpportunityDeadline(opportunity),
      summary: opportunity.summary
        ? String(opportunity.summary).slice(0, 180)
        : opportunity.description
          ? String(opportunity.description).slice(0, 180)
          : null,
      imageUrl: opportunity.image_url ? String(opportunity.image_url) : null,
      applyUrl: getOpportunityApplyUrl(opportunity),
      matchScore: typeof opportunity.ai_match_score === "number" ? opportunity.ai_match_score : null,
      matchReason: typeof opportunity.ai_match_reason === "string" ? opportunity.ai_match_reason : null,
    }));
}

function toSmartActions(cards: OpportunityCard[]): SmartAction[] {
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

function isOpportunityIntent(message: string) {
  const normalized = message.toLowerCase();
  if (isRoadmapIntent(normalized)) return false;
  return [
    /\b(show|find|get|recommend|list|suggest|available|matching|trending)\b.*\b(scholarships?|opportunities?|internships?|fellowships?|grants?|jobs?)\b/i,
    /\b(scholarships?|opportunities?|internships?|fellowships?|grants?|jobs?)\b.*\b(show|find|get|recommend|list|suggest|available|matching|trending)\b/i,
    /\b(mastercard)\b.*\b(opportunities?|scholarships?|matches|available)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function isRoadmapIntent(message: string) {
  const normalized = message.toLowerCase();
  return [
    /\broadmap\b/i,
    /\b(plan|prepare|timeline|schedule)\b.*\b(apply|application|opportunity|scholarship)\b/i,
    /\bbuild\b.*\b(plan|roadmap)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function isEdutuRelevant(message: string) {
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

function buildCoachSystemPrompt(params: {
  profile: Record<string, unknown> | null;
  goals: Array<Record<string, unknown>>;
  localContext: string;
  topMatches: Array<any>;
  message: string;
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
- ${params.includeOpportunities ? "Do not list opportunity names, details, deadlines, or links in the message. The app renders real opportunity cards separately from INTERNAL OPPORTUNITIES." : "Do not recommend opportunities unless the user asks for them."}
- When opportunity cards are attached, write only a short intro and one action cue.
- For roadmap or application-plan requests: do not show opportunity lists. If the user has not named a specific opportunity, ask which opportunity to build the roadmap for. If they named one, confirm the deadline and say you can create a deadline-based plan with daily goals, checklist, resources, calendar items, and reminders.

${buildProfileContext(params.profile, params.goals)}

INTERNAL OPPORTUNITIES:
${params.localContext}

Top match notes:
${params.topMatches.map((item) => `- ${item.title}: score ${item.ai_match_score || 0}${item.ai_match_reason ? `, reason: ${item.ai_match_reason}` : ""}`).join("\n") || "- None"}

User request:
${params.message}`;
}

function fallbackRankOpportunities(opportunities: OpportunityRow[], profile: Record<string, unknown> | null, message: string) {
  const searchTerms = [
    ...String(message || "").toLowerCase().split(/\W+/).filter(Boolean),
    ...(Array.isArray(profile?.interests) ? profile.interests.map((value) => String(value).toLowerCase()) : []),
    ...(Array.isArray(profile?.skills) ? profile.skills.map((value) => String(value).toLowerCase()) : []),
    String(profile?.field_of_study || "").toLowerCase(),
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
      ].join(" ").toLowerCase();

      const score = searchTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...opportunity, ai_match_score: score };
    })
    .sort((a, b) => b.ai_match_score - a.ai_match_score)
    .slice(0, 5);
}

async function fetchSharedRecommendations(apiUrl: string, payload: {
  message: string;
  profile: Record<string, unknown> | null;
  goals: Array<Record<string, unknown>> | null;
}) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/opportunities/recommendations/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: payload.message,
      profile: payload.profile,
      goals: payload.goals,
      limit: 5,
      minMatchScore: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`Recommendation API failed with ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.opportunities) ? data.opportunities : [];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await verifyClerkRequest(req);
    const { message, threadId, userId, mode, audio } = await req.json();
    const authenticatedUserId = claims.sub;

    if (userId && userId !== authenticatedUserId) {
      return new Response(JSON.stringify({ error: "Cannot act on behalf of another user" }), {
        status: 403,
        headers: { ...corsHeaders, ...SECURITY_HEADERS },
      });
    }

    if (!authenticatedUserId) {
      return new Response(JSON.stringify({ error: "Missing authenticated user" }), {
        status: 401,
        headers: { ...corsHeaders, ...SECURITY_HEADERS },
      });
    }

    const userIdKey = String(authenticatedUserId);
    if (!checkRateLimit(userIdKey)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, ...SECURITY_HEADERS },
      });
    }

    const safeUserId = authenticatedUserId;
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (mode === "threads") {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id, title, updated_at")
        .eq("user_id", safeUserId)
        .order("updated_at", { ascending: false });

      if (error) throw new Error(`Failed to load chat threads: ${error.message}`);
      return new Response(JSON.stringify({ threads: data || [] }), {
        headers: { ...corsHeaders, ...SECURITY_HEADERS },
      });
    }

    if (mode === "messages") {
      if (!threadId) {
        return new Response(JSON.stringify({ error: "Missing threadId" }), {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS },
        });
      }

      const { data: ownedThread } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("id", threadId)
        .eq("user_id", safeUserId)
        .maybeSingle();

      if (!ownedThread) {
        return new Response(JSON.stringify({ error: "Conversation not found" }), {
          status: 404,
          headers: { ...corsHeaders, ...SECURITY_HEADERS },
        });
      }

      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, metadata, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (error) throw new Error(`Failed to load chat messages: ${error.message}`);
      return new Response(JSON.stringify({ messages: data || [] }), {
        headers: { ...corsHeaders, ...SECURITY_HEADERS },
      });
    }

    if (mode === "delete-thread" || mode === "archive-thread") {
      if (!threadId) {
        return new Response(JSON.stringify({ error: "Missing threadId" }), {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS },
        });
      }

      const { error } = await supabase
        .from("chat_threads")
        .delete()
        .eq("id", threadId)
        .eq("user_id", safeUserId);

      if (error) throw new Error(`Failed to delete chat thread: ${error.message}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, ...SECURITY_HEADERS },
      });
    }

    if (mode === "transcribe") {
      if (!audio?.data || !audio?.mimeType) {
        return new Response(JSON.stringify({ error: "Missing audio payload" }), {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS },
        });
      }
      if (String(audio.data).length > MAX_AUDIO_BASE64_BYTES) {
        return new Response(JSON.stringify({ error: "Audio payload is too large" }), {
          status: 413,
          headers: { ...corsHeaders, ...SECURITY_HEADERS },
        });
      }

      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured for transcription" }), {
          status: 500,
          headers: { ...corsHeaders, ...SECURITY_HEADERS },
        });
      }

      try {
        const transcript = await transcribeAudio(openaiKey, audio as AudioPayload);
        return new Response(JSON.stringify({ transcript }), {
          headers: { ...corsHeaders, ...SECURITY_HEADERS },
        });
      } catch (error) {
        console.error("OpenAI transcription failed:", error);
        return new Response(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Transcription is unavailable",
          }),
          {
            status: 501,
            headers: { ...corsHeaders, ...SECURITY_HEADERS },
          },
        );
      }
    }

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", safeUserId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from("profiles").insert({
        user_id: safeUserId,
        full_name: "Edutu User",
      });
    }

    let activeThreadId = threadId;
    if (!activeThreadId) {
      const { data: thread, error: threadError } = await supabase
        .from("chat_threads")
        .insert({
          user_id: safeUserId,
          title: String(message).slice(0, 48),
        })
        .select("id")
        .single();

      if (threadError || !thread) {
        throw new Error(`Failed to create chat thread: ${threadError?.message || "Unknown error"}`);
      }

      activeThreadId = thread.id;
    }

    const userMessage = String(message || "").trim();
    const isRelevantRequest = isEdutuRelevant(userMessage);
    const wantsOpportunities = isOpportunityIntent(userMessage);
    const wantsRoadmap = isRoadmapIntent(userMessage);
    const needsOpportunityContext = wantsOpportunities || wantsRoadmap;

    const [{ data: profile }, { data: goals }, { data: opportunities }] = await Promise.all([
      supabase
        .from("profiles")
        .select("country, field_of_study, education_level, interests, skills")
        .eq("user_id", safeUserId)
        .maybeSingle(),
      supabase
        .from("goals")
        .select("title, deadline, progress")
        .eq("user_id", safeUserId)
        .limit(5),
      supabase
        .from("opportunities")
        .select("*")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(25),
    ]);

    let rankedOpportunities: Array<any> =
      needsOpportunityContext ? fallbackRankOpportunities(opportunities || [], profile, userMessage) : [];
    let usedSharedRecommendations = false;

    const recommendationApiUrl = Deno.env.get("EDUTU_API_URL");
    if (needsOpportunityContext && recommendationApiUrl) {
      try {
        const sharedRecommendations = await fetchSharedRecommendations(recommendationApiUrl, {
          message: userMessage,
          profile,
          goals: goals || [],
        });

        if (sharedRecommendations.length) {
          usedSharedRecommendations = true;
          rankedOpportunities = sharedRecommendations.map((item: any) => ({
            ...item,
            external_url: item.external_url || item.applyUrl || item.application_url || null,
            application_url: item.application_url || item.applyUrl || item.external_url || null,
            image_url: item.image_url || item.imageUrl || null,
            summary: item.summary || item.description || null,
            organization: item.organization || item.fundingType || item.category || "Edutu",
            location: item.location || item.targetRegion || "Not specified",
            ai_match_reason: item.ai_match_reason || item.match_reasons?.[0] || "",
            ai_match_score: item.ai_match_score || item.match || 0,
          }));
        }
      } catch (error) {
        console.error("Shared recommendation API failed:", error);
      }
    }

    if (needsOpportunityContext && deepseekKey && opportunities?.length && !usedSharedRecommendations) {
      try {
        const ranking = await callDeepSeekJson(deepseekKey, `You rank internal Edutu opportunities for a user.

Return strict JSON with this shape:
{
  "matches": [
    { "id": "uuid", "score": 0-100, "reason": "short reason grounded in the user request" }
  ]
}

User profile and goals:
${buildProfileContext(profile, goals || [])}

User request:
${userMessage}

Candidate opportunities:
${JSON.stringify(opportunities, null, 2)}`);

        const rankingEntries = Array.isArray(ranking?.matches) ? ranking.matches : [];
        const rankingMap = new Map(
          rankingEntries
            .filter((entry: Record<string, unknown>) => typeof entry.id === "string")
            .map((entry: Record<string, unknown>) => [String(entry.id), entry]),
        );

        rankedOpportunities = (opportunities || [])
          .map((opportunity) => {
            const ranked = rankingMap.get(opportunity.id) as Record<string, unknown> | undefined;
            return {
              ...opportunity,
              ai_match_reason: typeof ranked?.reason === "string" ? ranked.reason : "",
              ai_match_score: typeof ranked?.score === "number" ? ranked.score : 0,
            };
          })
          .sort((a, b) => (b.ai_match_score || 0) - (a.ai_match_score || 0))
          .slice(0, 5);
      } catch (error) {
        console.error("DeepSeek ranking failed:", error);
      }
    }

    const topMatches = rankedOpportunities.slice(0, 5);
    const localContext = buildOpportunityContext(topMatches);

    let finalAnswer = "";
    if (!isRelevantRequest) {
      finalAnswer = EDUTU_TOPIC_REDIRECT;
    } else if (deepseekKey) {
      try {
        const coachResponse = parseCoachResponse(await callDeepSeek(
          deepseekKey,
          buildCoachSystemPrompt({
            profile,
            goals: goals || [],
            localContext,
            topMatches,
            message: userMessage,
            includeOpportunities: wantsOpportunities && topMatches.length > 0,
          }),
          "application/json",
        ));
        finalAnswer = coachResponse.message;
      } catch (error) {
        console.error("DeepSeek response failed:", error);
      }
    }

    if (!finalAnswer) {
      if (wantsOpportunities && topMatches.length) {
        finalAnswer = buildCardFirstAnswer(Math.min(topMatches.length, 4));
      } else if (wantsRoadmap) {
        finalAnswer = "Which opportunity should we build the roadmap for?\nSend the name, or open an opportunity and tap Roadmap.";
      } else {
        finalAnswer = "I can help with that. Share your goal, field, country, education level, and deadline window, and I will give you a focused next step.";
      }
    }

    finalAnswer = sanitizeCoachMessage(finalAnswer);

    const opportunityCards = toOpportunityCards(topMatches);
    const shouldAttachCards = wantsOpportunities && opportunityCards.length > 0;
    const smartActions = shouldAttachCards ? toSmartActions(opportunityCards) : [];

    if (shouldAttachCards && looksLikeOpportunityDump(finalAnswer)) {
      finalAnswer = buildCardFirstAnswer(opportunityCards.length);
    }

    if (wantsRoadmap && looksLikeRoadmapDump(finalAnswer)) {
      finalAnswer = buildRoadmapFirstAnswer(topMatches.length > 0);
    }

    const { data: savedMessages, error: saveError } = await supabase
      .from("chat_messages")
      .insert([
        { thread_id: activeThreadId, user_id: safeUserId, role: "user", content: userMessage, metadata: {} },
        {
          thread_id: activeThreadId,
          user_id: safeUserId,
          role: "assistant",
          content: finalAnswer,
          metadata: {
            intent: wantsOpportunities ? "opportunity_search" : "general",
            opportunities: shouldAttachCards ? opportunityCards : [],
            smartActions,
          },
        },
      ])
      .select("id, thread_id, role, content, metadata, created_at");

    if (saveError || !savedMessages?.length) {
      throw new Error(`Failed to save messages: ${saveError?.message || "Unknown error"}`);
    }

    await supabase
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeThreadId);

    return new Response(JSON.stringify({
      threadId: activeThreadId,
      userMessage: savedMessages.find((item: { role: string }) => item.role === "user"),
      assistantMessage: savedMessages.find((item: { role: string }) => item.role === "assistant"),
    }), {
      headers: { ...corsHeaders, ...SECURITY_HEADERS },
    });
  } catch (error) {
    console.error("Error in chat-proxy:", error);
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("bearer") || message.includes("token") ? 401 : 500;
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status,
      headers: { ...corsHeaders, ...SECURITY_HEADERS },
    });
  }
});
