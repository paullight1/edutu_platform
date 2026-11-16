import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { retiredRevenueCatWebhookResponse } from "./index.ts";

Deno.test(
  "retired RevenueCat webhook always returns a mutation-free 410",
  async () => {
    const response = retiredRevenueCatWebhookResponse();

    assertEquals(response.status, 410);
    assertEquals(response.headers.get("cache-control"), "no-store");
    assertEquals(await response.json(), {
      error: "gone",
      message: "RevenueCat webhook delivery has moved to the Edutu API.",
    });
  },
);
