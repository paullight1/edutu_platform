import { appendFileSync } from "node:fs";
import { validatePullRequestReview } from "./release-review.mjs";

const result = validatePullRequestReview({
  body: process.env.PR_BODY ?? "",
  draft: process.env.PR_DRAFT ?? "false",
  headSha: process.env.PR_HEAD_SHA ?? "",
  headRef: process.env.PR_HEAD_REF ?? "",
  baseRef: process.env.PR_BASE_REF ?? "",
});

const lines = result.ok
  ? [`Release review gate: ${result.status}.`]
  : [
      "Release review gate blocked this pull request:",
      ...result.errors.map((error) => `- ${error}`),
    ];

for (const line of lines) {
  console.log(line);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const heading = result.ok
    ? "## Release review gate passed"
    : "## Release review gate blocked";
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `${heading}\n\n${lines.join("\n")}\n`,
    "utf8",
  );
}

if (!result.ok) {
  process.exitCode = 1;
}
