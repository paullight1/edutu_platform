#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  buildVerificationPlan,
  detectChangedSurfaces,
  formatLocalReviewApproval,
} from "./release-review.mjs";

function usage() {
  return `Edutu exact-commit local review

Usage:
  node scripts/local-review.mjs [--base <git-ref>] [--install] [--dry-run]

Options:
  --base <git-ref>  Compare against this ref. Defaults to origin/develop when
                    available, otherwise origin/main.
  --install         Run npm ci in each changed Node workspace before checks.
  --dry-run         Print detected surfaces and commands without executing them.
  --help            Show this help.

The command never runs migrations, seeds, remote configuration writes, or
production deployment commands.`;
}

function parseArgs(argv) {
  const options = { base: null, install: false, dryRun: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--install") {
      options.install = true;
    } else if (value === "--dry-run") {
      options.dryRun = true;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else if (value === "--base") {
      const base = argv[index + 1];
      if (!base || base.startsWith("--")) {
        throw new Error("--base requires a Git ref, for example origin/develop");
      }
      options.base = base;
      index += 1;
    } else if (value.startsWith("--base=")) {
      options.base = value.slice("--base=".length).trim();
      if (!options.base) throw new Error("--base cannot be empty");
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }

  return options;
}

function executable(command) {
  return process.platform === "win32" && command === "npm"
    ? "npm.cmd"
    : command;
}

function runCapture(command, args, { cwd = process.cwd(), allowFailure = false } = {}) {
  const result = spawnSync(executable(command), args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}${
        detail ? `\n${detail}` : ""
      }`,
    );
  }

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
  };
}

function git(args, options) {
  return runCapture("git", args, options).stdout;
}

function refExists(ref, root) {
  return (
    runCapture("git", ["rev-parse", "--verify", "--quiet", ref], {
      cwd: root,
      allowFailure: true,
    }).status === 0
  );
}

function renderCommand(step) {
  const quotedArgs = step.args.map((arg) =>
    /[\s"']/u.test(arg) ? JSON.stringify(arg) : arg,
  );
  return `${step.command} ${quotedArgs.join(" ")}`.trim();
}

function runStep(step, root) {
  const cwd = resolve(root, step.cwd);
  console.log(`\n▶ ${step.label}`);
  console.log(`  (${step.cwd}) ${renderCommand(step)}`);

  const result = spawnSync(executable(step.command), step.args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${step.label} failed with exit code ${result.status}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const root = git(["rev-parse", "--show-toplevel"]);
  const branch = git(["branch", "--show-current"], { cwd: root }) || "<detached>";
  const headSha = git(["rev-parse", "HEAD"], { cwd: root }).toLowerCase();

  if (branch === "main") {
    throw new Error(
      "Refusing to issue local-review evidence from main. Check out the pull request branch or an isolated review worktree.",
    );
  }

  const dirty = git(["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root,
  });
  if (dirty) {
    throw new Error(
      "The worktree is not clean. Commit, stash, or remove local changes before reviewing an exact SHA.",
    );
  }

  const baseRef =
    options.base ??
    (refExists("origin/develop", root) ? "origin/develop" : "origin/main");

  if (!refExists(baseRef, root)) {
    throw new Error(
      `Base ref ${baseRef} does not exist locally. Run git fetch origin and retry.`,
    );
  }

  const changedOutput = git(["diff", "--name-only", `${baseRef}...HEAD`], {
    cwd: root,
  });
  const changedPaths = changedOutput
    .split(/\r?\n/u)
    .map((path) => path.trim())
    .filter(Boolean);

  if (changedPaths.length === 0) {
    throw new Error(`No changes found between ${baseRef} and ${headSha}.`);
  }

  const surfaces = detectChangedSurfaces(changedPaths);
  const plan = buildVerificationPlan(surfaces, { install: options.install });

  console.log("Edutu exact-commit local review");
  console.log(`Branch: ${branch}`);
  console.log(`Head SHA: ${headSha}`);
  console.log(`Base: ${baseRef}`);
  console.log(`Changed files: ${changedPaths.length}`);
  console.log(`Surfaces: ${[...surfaces].sort().join(", ") || "docs"}`);
  console.log("\nVerification plan:");
  plan.forEach((step, index) => {
    console.log(`${index + 1}. [${step.cwd}] ${renderCommand(step)}`);
  });

  if (options.dryRun) {
    console.log("\nDry run only. No review evidence was issued.");
    return;
  }

  for (const step of plan) {
    runStep(step, root);
  }

  console.log("\nAll selected local-review checks passed for this exact commit.");
  console.log("Copy these lines into the pull request body:\n");
  console.log(
    formatLocalReviewApproval({
      headSha,
      baseRef,
      surfaces,
    }),
  );
  console.log(
    "\nAny new commit changes the PR head SHA and invalidates this approval.",
  );
}

try {
  main();
} catch (error) {
  console.error(`\nLocal review failed: ${
    error instanceof Error ? error.message : String(error)
  }`);
  process.exitCode = 1;
}
