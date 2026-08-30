// This endpoint is intentionally retired. RevenueCat subscription lifecycle
// authority lives in the NestJS billing inbox and processor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export function retiredRevenueCatWebhookResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "gone",
      message: "RevenueCat webhook delivery has moved to the Edutu API.",
    }),
    { status: 410, headers: SECURITY_HEADERS },
  );
}

if (import.meta.main) {
  serve(() => retiredRevenueCatWebhookResponse());
}
