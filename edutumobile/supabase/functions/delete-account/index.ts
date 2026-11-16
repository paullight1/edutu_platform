import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyClerkRequest } from "../_shared/clerk-auth.ts";
import { removeUserStorage } from "./storage.ts";
import { deleteUserRows } from "./rows.ts";

const MAX_REQUEST_BYTES = 8_192;
const corsHeaders = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};



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

    // Fail closed until shared-content anonymisation, financial retention,
    // identity deletion and retry-safe orchestration are implemented together.
    // The individual helpers are retained for tests and later integration.
    void supabase;
    void deleteUserRows;
    void removeUserStorage;
    return response(request, 503, { error: "Account deletion is temporarily unavailable" });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const status = message.includes("bearer") || message.includes("token") ||
        message.includes("issuer") || message.includes("signature") ? 401 : 500;
    console.error("Account deletion failed", { status });
    return response(request, status, { error: status === 401 ? "Authentication failed" : "Service unavailable" });
  }
});
