import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyClerkRequest } from "../_shared/clerk-auth.ts";

const MAX_REQUEST_BYTES = 8_192;
const corsHeaders = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const deletionTargets = [
  ["chat_messages", "user_id"],
  ["chat_threads", "user_id"],
  ["flashcard_reviews", "user_id"],
  ["flashcard_study_sessions", "user_id"],
  ["flashcard_decks", "user_id"],
  ["quiz_attempts", "user_id"],
  ["quizzes", "user_id"],
  ["goals", "user_id"],
  ["bookmarks", "user_id"],
  ["user_opportunity_bookmarks", "user_id"],
  ["user_opportunity_preferences", "user_id"],
  ["user_opportunity_signals", "user_id"],
  ["notifications", "user_id"],
  ["user_notifications", "user_id"],
  ["opportunity_applications", "user_id"],
  ["wallet_transactions", "user_id"],
  ["payment_transactions", "user_id"],
  ["credit_purchases", "user_id"],
  ["subscriptions", "user_id"],
  ["transactions", "user_id"],
  ["billing_subscriptions", "user_id"],
  ["billing_entitlements", "user_id"],
  ["billing_transactions", "user_id"],
  ["processed_webhook_events", "user_id"],
  ["roadmap_enrollments", "user_id"],
  ["user_roadmap_intents", "user_id"],
  ["roadmap_feedback", "user_id"],
  ["creator_applications", "user_id"],
  ["creator-applications", "user_id"],
  ["community_posts", "user_id"],
  ["community_stories", "user_id"],
  ["community_group_members", "user_id"],
  ["community_join_requests", "user_id"],
  ["community_groups", "owner_id"],
  ["marketplace_enrollments", "user_id"],
  ["marketplace_items", "creator_id"],
  ["marketplace_listings", "seller_id"],
  ["user_cvs", "user_id"],
  ["tickets", "user_id"],
  ["profiles", "user_id"],
] as const;

function originFor(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const configured = (Deno.env.get("EDUTU_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (configured.includes(origin)) return origin;
  return null;
}

function headers(request: Request): Headers {
  const result = new Headers(corsHeaders);
  const origin = originFor(request);
  if (origin) {
    result.set("Access-Control-Allow-Origin", origin);
    result.set("Vary", "Origin");
  }
  return result;
}

function response(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function removeUserStorage(
  supabase: any,
  userId: string,
): Promise<void> {
  for (const bucket of ["ai-documents", "creator-applications"]) {
    const listed = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
    if (listed.error && listed.error.message !== "Not Found") throw listed.error;
    const paths = (listed.data ?? []).map((entry) => `${userId}/${entry.name}`);
    if (paths.length > 0) {
      const removed = await supabase.storage.from(bucket).remove(paths);
      if (removed.error) throw removed.error;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    const result = headers(request);
    result.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    result.set("Access-Control-Allow-Headers", "authorization, content-type");
    return new Response(null, { status: 204, headers: result });
  }
  if (request.method !== "POST") return response(request, 405, { error: "Request not supported" });

  try {
    const claims = await verifyClerkRequest(request);
    const userId = claims.sub?.trim();
    if (!userId) return response(request, 401, { error: "Authentication required" });

    const body = await readBody(request);
    if (!body) return response(request, 400, { error: "Invalid request" });
    if (typeof body.user_id === "string" && body.user_id !== userId) {
      return response(request, 403, { error: "Account ownership mismatch" });
    }

    const url = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!url || !serviceRoleKey) return response(request, 500, { error: "Service unavailable" });
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    for (const [table, column] of deletionTargets) {
      const result = await supabase.from(table).delete().eq(column, userId);
      // Optional legacy tables may not exist; all other failures abort without
      // disclosing schema or provider details to the caller.
      if (result.error && result.error.code !== "42P01") throw result.error;
    }
    await removeUserStorage(supabase, userId);

    return response(request, 200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const status = message.includes("bearer") || message.includes("token") ||
        message.includes("issuer") || message.includes("signature") ? 401 : 500;
    console.error("Account deletion failed", { status });
    return response(request, status, { error: status === 401 ? "Authentication failed" : "Service unavailable" });
  }
});
