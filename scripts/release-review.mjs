const REVIEW_MARKER_KEYS = [
  "Release-Type",
  "Local-Review-Approved",
  "Local-Review-SHA",
  "Staging-Review-Approved",
  "Staging-Review-SHA",
];

const SHA_PATTERN = /^[0-9a-f]{40}$/iu;

const ROOT_GOVERNANCE_TESTS = [
  "scripts/release-review.test.mjs",
  "scripts/architecture-boundaries.test.mjs",
  "scripts/check-admin-runtime-config.test.mjs",
  "scripts/check-mobile-audit.test.mjs",
  "scripts/migration-ownership.test.mjs",
  "scripts/validate-seo-routes.test.mjs",
  "scripts/validate-vercel-config.test.mjs",
];

function canonicalMarkerKey(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return REVIEW_MARKER_KEYS.find((key) => key.toLowerCase() === normalized);
}

function collectReviewMarkers(body) {
  const values = {};
  const duplicates = new Set();
  let inFence = false;

  for (const line of String(body ?? "").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (/^(```|~~~)/u.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9-]*):\s*(.*?)\s*$/u);
    if (!match) continue;

    const key = canonicalMarkerKey(match[1]);
    if (!key) continue;

    if (Object.hasOwn(values, key)) {
      duplicates.add(key);
      continue;
    }
    values[key] = match[2];
  }

  return { values, duplicates };
}

export function parseReviewMarkers(body) {
  return { ...collectReviewMarkers(body).values };
}

function equalsHeadSha(value, headSha) {
  return (
    SHA_PATTERN.test(String(value ?? "").trim()) &&
    String(value).trim().toLowerCase() === String(headSha).trim().toLowerCase()
  );
}

function isYes(value) {
  return String(value ?? "").trim().toLowerCase() === "yes";
}

export function validatePullRequestReview({
  body,
  draft,
  headSha,
  headRef,
  baseRef,
}) {
  if (draft === true || String(draft).toLowerCase() === "true") {
    return { ok: true, status: "draft", errors: [] };
  }

  const errors = [];
  const normalizedHeadSha = String(headSha ?? "").trim().toLowerCase();
  const normalizedHeadRef = String(headRef ?? "").trim();
  const normalizedBaseRef = String(baseRef ?? "").trim();
  const { values: markers, duplicates } = collectReviewMarkers(body);

  for (const key of duplicates) {
    errors.push(`Duplicate review marker: ${key}.`);
  }

  if (!SHA_PATTERN.test(normalizedHeadSha)) {
    errors.push("The pull request head SHA must be a 40-character Git SHA.");
  }

  const releaseType = String(markers["Release-Type"] ?? "")
    .trim()
    .toLowerCase();

  if (!isYes(markers["Local-Review-Approved"])) {
    errors.push(
      "Local-Review-Approved must be yes for a non-draft pull request.",
    );
  }
  if (!equalsHeadSha(markers["Local-Review-SHA"], normalizedHeadSha)) {
    errors.push(
      `Local-Review-SHA must equal the current head SHA (${normalizedHeadSha}).`,
    );
  }

  let successStatus = "blocked";

  if (normalizedBaseRef === "develop") {
    successStatus = "approved-for-develop";
    if (releaseType !== "feature") {
      errors.push("Pull requests into develop must use Release-Type: feature.");
    }
    if (
      !normalizedHeadRef ||
      normalizedHeadRef === "develop" ||
      normalizedHeadRef === "main"
    ) {
      errors.push(
        "Feature pull requests into develop must originate from a separate feature branch.",
      );
    }
  } else if (normalizedBaseRef === "main") {
    successStatus = "approved-for-production";

    if (releaseType === "release") {
      if (normalizedHeadRef !== "develop") {
        errors.push(
          "Release pull requests into main must originate from develop.",
        );
      }
    } else if (releaseType === "hotfix") {
      if (!normalizedHeadRef.startsWith("hotfix/")) {
        errors.push(
          "Hotfix pull requests into main must use a hotfix/* head branch.",
        );
      }
    } else {
      errors.push(
        "Feature pull requests must target develop before production; main accepts only release or hotfix pull requests.",
      );
    }

    if (!isYes(markers["Staging-Review-Approved"])) {
      errors.push(
        "Staging-Review-Approved must be yes for a pull request into main.",
      );
    }
    if (!equalsHeadSha(markers["Staging-Review-SHA"], normalizedHeadSha)) {
      errors.push(
        `Staging-Review-SHA must equal the current head SHA (${normalizedHeadSha}).`,
      );
    }
  } else {
    errors.push(
      `Unsupported base branch ${normalizedBaseRef || "<missing>"}; use develop or main.`,
    );
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? successStatus : "blocked",
    errors,
  };
}

export function detectChangedSurfaces(paths) {
  const surfaces = new Set();

  for (const rawPath of paths ?? []) {
    const path = String(rawPath).replaceAll("\\", "/").replace(/^\.\//u, "");
    if (!path) continue;

    if (path.startsWith("docs/")) surfaces.add("docs");
    if (
      path.startsWith(".github/") ||
      path.startsWith("scripts/") ||
      ["README.md", "AGENTS.md", "vercel.json", ".gitignore"].includes(path)
    ) {
      surfaces.add("governance");
    }
    if (
      path.startsWith("backend/services/services/api/") ||
      path.startsWith("supabase/")
    ) {
      surfaces.add("backend");
    }
    if (path.startsWith("backend/services/services/voice/")) {
      surfaces.add("voice");
    }
    if (path.startsWith("admin/")) surfaces.add("admin");
    if (path.startsWith("edutu-web-app/")) surfaces.add("web");
    if (
      path.startsWith("edutumobile/") ||
      path.startsWith("packages/ux-state/")
    ) {
      surfaces.add("mobile");
    }
    if (path.startsWith("crawl4ai-scraper/")) surfaces.add("scraper");

    if (!path.includes("/") && !path.endsWith(".md")) {
      surfaces.add("governance");
    }
  }

  return surfaces;
}

function step(cwd, command, args, label) {
  return { cwd, command, args, label };
}

function addNpmWorkspace(plan, cwd, commands, install) {
  if (install) {
    plan.push(step(cwd, "npm", ["ci"], `Install ${cwd} dependencies`));
  }
  for (const [script, extraArgs = []] of commands) {
    plan.push(
      step(
        cwd,
        "npm",
        ["run", script, ...extraArgs],
        `${cwd}: npm run ${script}`,
      ),
    );
  }
}

export function buildVerificationPlan(surfaces, { install = false } = {}) {
  const selected = surfaces instanceof Set ? surfaces : new Set(surfaces ?? []);
  const plan = [
    step(
      ".",
      "node",
      ["--test", ...ROOT_GOVERNANCE_TESTS],
      "Repository script tests",
    ),
  ];

  if (selected.has("governance")) {
    for (const script of [
      "check-architecture-boundaries.mjs",
      "check-migration-ownership.mjs",
      "check-migration-timestamps.mjs",
      "check-large-file-budgets.mjs",
      "check-admin-runtime-config.mjs",
      "validate-vercel-config.mjs",
      "validate-seo-routes.mjs",
    ]) {
      plan.push(
        step(".", "node", [`scripts/${script}`], `Repository check: ${script}`),
      );
    }
  }

  if (selected.has("backend")) {
    addNpmWorkspace(
      plan,
      "backend/services/services/api",
      [
        ["lint"],
        ["test"],
        ["test:e2e"],
        ["test:e2e:production"],
        ["build"],
      ],
      install,
    );
  }

  if (selected.has("admin")) {
    addNpmWorkspace(
      plan,
      "admin",
      [["lint"], ["test"], ["build"]],
      install,
    );
  }

  if (selected.has("web")) {
    addNpmWorkspace(
      plan,
      "edutu-web-app",
      [["lint"], ["typecheck"], ["test"], ["build"]],
      install,
    );
    plan.push(
      step(
        "edutu-web-app",
        "node",
        ["../scripts/validate-pwa-build.mjs", "dist"],
        "Validate web PWA build",
      ),
    );
  }

  if (selected.has("mobile")) {
    addNpmWorkspace(
      plan,
      "edutumobile",
      [["lint"], ["typecheck"], ["test", ["--", "--passWithNoTests"]]],
      install,
    );
  }

  if (selected.has("voice")) {
    addNpmWorkspace(
      plan,
      "backend/services/services/voice",
      [["typecheck"], ["test"], ["build"], ["test:smoke"]],
      install,
    );
  }

  if (selected.has("scraper")) {
    plan.push(
      step(
        "crawl4ai-scraper",
        "python3",
        ["-m", "pytest"],
        "Run scraper tests",
      ),
    );
  }

  return plan;
}

export function formatLocalReviewApproval({ headSha, baseRef, surfaces }) {
  const surfaceList = [...(surfaces ?? [])].sort().join(", ") || "docs";
  return [
    "Local-Review-Approved: yes",
    `Local-Review-SHA: ${String(headSha).trim().toLowerCase()}`,
    `Local-Review-Base: ${String(baseRef).trim()}`,
    `Local-Review-Surfaces: ${surfaceList}`,
  ].join("\n");
}
