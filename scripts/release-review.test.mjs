import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

let releaseReview = {};
try {
  releaseReview = await import("./release-review.mjs");
} catch {
  // RED phase: assertions below explain the missing production contract.
}

const HEAD_SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function requireExport(name) {
  assert.equal(
    typeof releaseReview[name],
    "function",
    `scripts/release-review.mjs must export ${name}()`,
  );
  return releaseReview[name];
}

function body(overrides = {}) {
  const values = {
    "Release-Type": "feature",
    "Local-Review-Approved": "yes",
    "Local-Review-SHA": HEAD_SHA,
    "Staging-Review-Approved": "no",
    "Staging-Review-SHA": "pending",
    ...overrides,
  };

  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

async function readOrEmpty(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

test("parseReviewMarkers reads evidence outside fenced examples", () => {
  const parseReviewMarkers = requireExport("parseReviewMarkers");
  const parsed = parseReviewMarkers([
    "```text",
    `Local-Review-SHA: ${OTHER_SHA}`,
    "```",
    "Local-Review-Approved: yes",
    `Local-Review-SHA: ${HEAD_SHA}`,
  ].join("\n"));

  assert.equal(parsed["Local-Review-Approved"], "yes");
  assert.equal(parsed["Local-Review-SHA"], HEAD_SHA);
});

test("draft pull requests remain reviewable before evidence is complete", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: "",
    draft: true,
    headSha: HEAD_SHA,
    headRef: "feat/example",
    baseRef: "develop",
  });

  assert.deepEqual(result, {
    ok: true,
    status: "draft",
    errors: [],
  });
});

test("feature pull requests into develop require exact local-review SHA", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: body(),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "feat/example",
    baseRef: "develop",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "approved-for-develop");
  assert.deepEqual(result.errors, []);
});

test("a new commit invalidates stale local-review evidence", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: body({ "Local-Review-SHA": OTHER_SHA }),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "feat/example",
    baseRef: "develop",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Local-Review-SHA.*current head SHA/i);
});

test("feature pull requests cannot bypass develop and target main", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: body(),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "feat/example",
    baseRef: "main",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /feature.*develop/i);
});

test("release pull requests into main require develop and exact staging evidence", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: body({
      "Release-Type": "release",
      "Staging-Review-Approved": "yes",
      "Staging-Review-SHA": HEAD_SHA,
    }),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "develop",
    baseRef: "main",
  });

  assert.deepEqual(result, {
    ok: true,
    status: "approved-for-production",
    errors: [],
  });
});

test("release pull requests fail when staging approval is missing or stale", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: body({
      "Release-Type": "release",
      "Staging-Review-Approved": "yes",
      "Staging-Review-SHA": OTHER_SHA,
    }),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "develop",
    baseRef: "main",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Staging-Review-SHA.*current head SHA/i);
});

test("release pull requests into main must originate from develop", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: body({
      "Release-Type": "release",
      "Staging-Review-Approved": "yes",
      "Staging-Review-SHA": HEAD_SHA,
    }),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "release/random",
    baseRef: "main",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /release.*develop/i);
});

test("hotfix pull requests into main require a hotfix branch and staging evidence", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const approved = validatePullRequestReview({
    body: body({
      "Release-Type": "hotfix",
      "Staging-Review-Approved": "yes",
      "Staging-Review-SHA": HEAD_SHA,
    }),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "hotfix/login-outage",
    baseRef: "main",
  });
  const rejected = validatePullRequestReview({
    body: body({
      "Release-Type": "hotfix",
      "Staging-Review-Approved": "yes",
      "Staging-Review-SHA": HEAD_SHA,
    }),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "fix/login-outage",
    baseRef: "main",
  });

  assert.equal(approved.ok, true);
  assert.equal(approved.status, "approved-for-production");
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join("\n"), /hotfix\//i);
});

test("malformed approval values fail closed", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: body({
      "Local-Review-Approved": "true",
      "Local-Review-SHA": "not-a-sha",
    }),
    draft: false,
    headSha: HEAD_SHA,
    headRef: "feat/example",
    baseRef: "develop",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Local-Review-Approved.*yes/i);
  assert.match(result.errors.join("\n"), /Local-Review-SHA/i);
});

test("duplicate evidence markers fail closed", () => {
  const validatePullRequestReview = requireExport("validatePullRequestReview");
  const result = validatePullRequestReview({
    body: `${body()}\nLocal-Review-SHA: ${HEAD_SHA}`,
    draft: false,
    headSha: HEAD_SHA,
    headRef: "feat/example",
    baseRef: "develop",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /duplicate.*Local-Review-SHA/i);
});

test("changed paths map to the repository surfaces that must be verified", () => {
  const detectChangedSurfaces = requireExport("detectChangedSurfaces");
  const surfaces = detectChangedSurfaces([
    ".github/workflows/ci.yml",
    "backend/services/services/api/src/app.module.ts",
    "admin/src/pages/Settings.tsx",
    "edutu-web-app/src/App.tsx",
    "edutumobile/app/(app)/index.tsx",
    "backend/services/services/voice/src/main.ts",
    "crawl4ai-scraper/main.py",
    "docs/OPERATIONS.md",
  ]);

  assert.deepEqual([...surfaces].sort(), [
    "admin",
    "backend",
    "docs",
    "governance",
    "mobile",
    "scraper",
    "voice",
    "web",
  ]);
});

test("verification plans reuse existing workspace commands and never run migrations", () => {
  const buildVerificationPlan = requireExport("buildVerificationPlan");
  const plan = buildVerificationPlan(
    new Set(["governance", "backend", "admin", "web", "mobile"]),
    { install: true },
  );
  const rendered = plan
    .map((step) => `${step.cwd} ${step.command} ${step.args.join(" ")}`)
    .join("\n");

  assert.match(rendered, /backend\/services\/services\/api npm ci/);
  assert.match(rendered, /backend\/services\/services\/api npm run test:e2e/);
  assert.match(rendered, /admin npm run build/);
  assert.match(rendered, /edutu-web-app npm run typecheck/);
  assert.match(rendered, /edutumobile npm run test -- --passWithNoTests/);
  assert.doesNotMatch(rendered, /db:(migrate|push|seed)|supabase db/i);
});

test("CI and architecture workflows run for pull requests into main and develop", async () => {
  const ci = await readOrEmpty(".github/workflows/ci.yml");
  const architecture = await readOrEmpty(
    ".github/workflows/architecture-governance.yml",
  );

  assert.match(ci, /pull_request:\s*\n\s*branches:\s*\[main, develop\]/);
  assert.match(
    architecture,
    /pull_request:\s*\n\s*branches:\s*\[main, develop\]/,
  );
});

test("the dedicated workflow reruns when review evidence or the head SHA changes", async () => {
  const workflow = await readOrEmpty(
    ".github/workflows/local-review-gate.yml",
  );

  assert.match(workflow, /branches:\s*\[main, develop\]/);
  for (const event of [
    "opened",
    "edited",
    "synchronize",
    "reopened",
    "ready_for_review",
    "converted_to_draft",
  ]) {
    assert.match(workflow, new RegExp(`\\b${event}\\b`));
  }
  assert.match(workflow, /PR_HEAD_SHA/);
  assert.match(workflow, /PR_HEAD_REF/);
  assert.match(workflow, /PR_BASE_REF/);
  assert.match(workflow, /PR_DRAFT/);
  assert.match(workflow, /scripts\/check-release-review\.mjs/);
});

test("the pull request template carries exact-commit review markers", async () => {
  const template = await readOrEmpty(".github/pull_request_template.md");

  for (const marker of [
    "Release-Type:",
    "Local-Review-Approved:",
    "Local-Review-SHA:",
    "Staging-Review-Approved:",
    "Staging-Review-SHA:",
  ]) {
    assert.match(template, new RegExp(marker));
  }
  assert.match(template, /node scripts\/local-review\.mjs/);
});
