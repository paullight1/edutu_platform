#!/usr/bin/env node

const baseUrl = process.env.API_BASE_URL?.trim();
const apiKey = process.env.EDUTU_API_KEY?.trim();
const expectedOpportunityId = process.env.EXPECTED_OPPORTUNITY_ID?.trim();

function redact(value) {
  const text = String(value ?? "");
  return apiKey ? text.split(apiKey).join("[REDACTED]") : text;
}

function fail(message) {
  console.error(redact(`API production smoke failed: ${message}`));
  process.exitCode = 1;
}

function requireConfiguration() {
  if (!baseUrl) throw new Error("API_BASE_URL is required");
  if (!apiKey) throw new Error("EDUTU_API_KEY is required");

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("API_BASE_URL must be an absolute URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("API_BASE_URL must use http or https");
  }
}

function assertStableHeaders(response, path) {
  const requestId = response.headers.get("x-edutu-request-id");
  if (!requestId || !/^[a-zA-Z0-9_.:-]{8,80}$/.test(requestId)) {
    throw new Error(
      `${path} did not return a stable X-Edutu-Request-Id header`,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${path} did not return JSON`);
  }
}

async function getJson(path) {
  const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-edutu-api-key": apiKey,
      authorization: `Bearer ${apiKey}`,
    },
  });
  assertStableHeaders(response, path);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  if (!body || typeof body !== "object")
    throw new Error(`${path} returned an invalid JSON body`);
  return body;
}

async function main() {
  requireConfiguration();
  const health = await getJson("/v1/health");
  if (health.status !== "ok") throw new Error("/v1/health did not report ok");

  const usage = await getJson("/v1/usage");
  if (usage.object !== "usage")
    throw new Error("/v1/usage returned an unexpected object");

  const opportunities = await getJson("/v1/opportunities?limit=1");
  if (opportunities.object !== "list" || !Array.isArray(opportunities.data)) {
    throw new Error("/v1/opportunities returned an unexpected list contract");
  }

  if (expectedOpportunityId) {
    const opportunity = await getJson(
      `/v1/opportunities/${encodeURIComponent(expectedOpportunityId)}`,
    );
    if (opportunity.id !== expectedOpportunityId) {
      throw new Error(
        "EXPECTED_OPPORTUNITY_ID was not returned by the opportunity endpoint",
      );
    }
  }

  console.log(
    JSON.stringify({
      status: "ok",
      checks: [
        "health",
        "usage",
        "opportunities",
        ...(expectedOpportunityId ? ["opportunity"] : []),
      ],
    }),
  );
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : "unknown failure");
}
