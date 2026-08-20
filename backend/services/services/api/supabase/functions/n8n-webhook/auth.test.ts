import { requireWebhookApiKey } from "./auth.ts";

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("rejects a missing webhook API key", () => {
  assertEquals(
    requireWebhookApiKey(null),
    null,
    "missing x-api-key must fail closed",
  );
});

Deno.test("rejects a blank webhook API key", () => {
  assertEquals(
    requireWebhookApiKey("   "),
    null,
    "blank x-api-key must fail closed",
  );
});

Deno.test("normalizes a present webhook API key", () => {
  assertEquals(
    requireWebhookApiKey("  edutu_webhook_test  "),
    "edutu_webhook_test",
    "present x-api-key should be trimmed before validation",
  );
});
