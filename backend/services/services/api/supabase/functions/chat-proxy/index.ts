import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = Deno.env.get("OPENROUTER_MODEL") ?? "openrouter/auto";
const RATE_LIMIT_WINDOW_MINUTES = Number(Deno.env.get("CHAT_RATE_WINDOW_MINUTES") ?? "60");
const RATE_LIMIT_MAX_REQUESTS = Number(Deno.env.get("CHAT_RATE_MAX_REQUESTS") ?? "20");

const SYSTEM_PROMPT =
  Deno.env.get("CHAT_SYSTEM_PROMPT") ??
  "You are Edutu, an AI opportunity coach. Provide helpful, encouraging, and practical guidance for African youth pursuing scholarships, careers, and personal development. Keep answers concise and actionable.";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

if (!openRouterApiKey) {
  console.warn("OPENROUTER_API_KEY is not set. The chat proxy will return 503 responses.");
}

type ChatProxyRequest = {
  threadId?: string | null;
  message: string;
};

type ChatMessageRecord = {
  id: string;
  thread_id: string;
  user_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

interface ThreadRecord {
  id: string;
  user_id: string;
  title: string | null;
  updated_at: string;
}

const asIsoDate = (date: Date) => date.toISOString();

const formatTitle = (content: string) => {
  return content.length > 80 ? `${content.slice(0, 77)}...` : content;
};

async function getAuthenticatedClient(authHeader: string) {
  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    global: { headers: { Authorization: authHeader } }
  });
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  return { supabase, user };
}

async function ensureThread(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  threadId: string | undefined | null,
  userMessage: string
): Promise<ThreadRecord> {
  if (threadId) {
    const { data, error } = await supabase
      .from<ThreadRecord>("chat_threads")
      .select("*")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
    if (!data) {
      throw new Response(JSON.stringify({ error: "Thread not found" }), { status: 404 });
    }
    return data;
  }

  const title = formatTitle(userMessage);
  const { data, error } = await supabase
    .from<ThreadRecord>("chat_threads")
    .insert({
      user_id: userId,
      title,
      metadata: {}
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Response(JSON.stringify({ error: error?.message ?? "Unable to create thread" }), { status: 400 });
  }

  return data;
}

async function enforceRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", asIsoDate(windowStart));

  if (error) {
    throw new Response(JSON.stringify({ error: "Unable to evaluate rate limit" }), { status: 400 });
  }

  if (count !== null && count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), { status: 429 });
  }
}

async function loadConversation(
  supabase: ReturnType<typeof createClient>,
  threadId: string
) {
  const { data, error } = await supabase
    .from<ChatMessageRecord>("chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Response(JSON.stringify({ error: "Unable to load conversation context" }), { status: 400 });
  }
  return data ?? [];
}

const buildOpenRouterMessages = (
  conversation: ChatMessageRecord[],
  userMessage: string
) => {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversation
      .filter((message) => message.role === "assistant" || message.role === "user")
      .map((message) => ({
        role: message.role,
        content: message.content
      })),
    { role: "user" as const, content: userMessage }
  ];

  return messages;
};

const upsertChatUsage = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  totalTokens: number | null | undefined
) => {
  if (!Number.isFinite(totalTokens)) {
    return;
  }

  const nowUtc = new Date();
  const periodStart = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth() + 1, 1));

  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  const { data: usageRow, error: usageError } = await supabase
    .from("chat_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStartStr)
    .eq("period_end", periodEndStr)
    .maybeSingle();

  if (usageError) {
    console.error("Failed to load chat usage", usageError);
    return;
  }

  if (usageRow) {
    const { error } = await supabase
      .from("chat_usage")
      .update({
        total_requests: (usageRow.total_requests ?? 0) + 1,
        total_tokens: (usageRow.total_tokens ?? 0) + (totalTokens ?? 0)
      })
      .eq("id", usageRow.id);

    if (error) {
      console.error("Failed to update chat usage", error);
    }
  } else {
    const { error } = await supabase.from("chat_usage").insert({
      user_id: userId,
      period_start: periodStartStr,
      period_end: periodEndStr,
      total_requests: 1,
      total_tokens: totalTokens ?? 0
    });

    if (error) {
      console.error("Failed to insert chat usage", error);
    }
  }
};

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    if (!openRouterApiKey) {
      return new Response(JSON.stringify({ error: "Chat service unavailable. Try again later." }), {
        status: 503
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { supabase, user } = await getAuthenticatedClient(authHeader);
    const payload = (await req.json()) as ChatProxyRequest;

    const userMessage = payload.message?.trim();
    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Message cannot be empty." }), { status: 400 });
    }

    await enforceRateLimit(supabase, user.id);

    const thread = await ensureThread(supabase, user.id, payload.threadId, userMessage);

    const newUserMessage: Partial<ChatMessageRecord> = {
      thread_id: thread.id,
      user_id: user.id,
      role: "user",
      content: userMessage
    };

    const { data: insertedUserMessage, error: userMessageError } = await supabase
      .from<ChatMessageRecord>("chat_messages")
      .insert(newUserMessage)
      .select("*")
      .single();

    if (userMessageError || !insertedUserMessage) {
      return new Response(JSON.stringify({ error: "Unable to save your message." }), { status: 400 });
    }

    const conversation = await loadConversation(supabase, thread.id);
    const completionRequest = {
      model: MODEL,
      messages: buildOpenRouterMessages(conversation, userMessage),
      stream: false
    };

    const openRouterResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": Deno.env.get("OPENROUTER_REFERRER") ?? "https://edutu.app",
        "X-Title": Deno.env.get("OPENROUTER_TITLE") ?? "Edutu AI Coach"
      },
      body: JSON.stringify(completionRequest)
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error("OpenRouter failed", openRouterResponse.status, errorText);
      return new Response(JSON.stringify({ error: "AI service unavailable. Please try again." }), { status: 502 });
    }

    const openRouterJson = await openRouterResponse.json();
    const assistantContent: string | undefined =
      openRouterJson?.choices?.[0]?.message?.content?.trim();

    if (!assistantContent) {
      return new Response(JSON.stringify({ error: "AI did not return a response." }), { status: 502 });
    }

    const assistantMessagePayload: Partial<ChatMessageRecord> = {
      thread_id: thread.id,
      role: "assistant",
      content: assistantContent
    };

    const { data: insertedAssistantMessage, error: assistantMessageError } = await supabase
      .from<ChatMessageRecord>("chat_messages")
      .insert(assistantMessagePayload)
      .select("*")
      .single();

    if (assistantMessageError || !insertedAssistantMessage) {
      return new Response(JSON.stringify({ error: "Unable to store AI response." }), { status: 500 });
    }

    await supabase
      .from("chat_threads")
      .update({
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      })
      .eq("id", thread.id);

    await upsertChatUsage(supabase, user.id, openRouterJson?.usage?.total_tokens);

    return new Response(
      JSON.stringify({
        threadId: thread.id,
        userMessage: insertedUserMessage,
        assistantMessage: insertedAssistantMessage,
        usage: openRouterJson?.usage ?? null
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("Unexpected chat proxy error", error);
    return new Response(JSON.stringify({ error: "Unexpected error processing chat." }), { status: 500 });
  }
});
