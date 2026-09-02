#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SECURITY_AUDIT_TARGETS,
  evaluateSecurityAuditResults,
} from "./security-audit.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function executable(command) {
  return process.platform === "win32" && command === "npm"
    ? "npm.cmd"
    : command;
}

function run(command, args, cwd) {
  const result = spawnSync(executable(command), args, {
    cwd: resolve(root, cwd),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

const results = [];

for (const target of SECURITY_AUDIT_TARGETS) {
  console.log(`\n=== ${target.name}: install ===`);
  const installStatus = run("npm", ["ci"], target.installCwd);

  let auditStatus = null;
  if (installStatus === 0) {
    console.log(`\n=== ${target.name}: high/critical audit ===`);
    auditStatus = run(
      target.audit.command,
      [...target.audit.args],
      target.audit.cwd,
    );
  } else {
    console.error(
      `${target.name}: dependency installation failed; audit was not run.`,
    );
  }

  results.push({
    name: target.name,
    installStatus,
    auditStatus,
  });
}

console.log("\n=== Security audit summary ===");
for (const result of results) {
  const install = result.installStatus === 0 ? "pass" : "fail";
  const audit =
    result.auditStatus === null
      ? "not-run"
      : result.auditStatus === 0
        ? "pass"
        : "fail";
  console.log(`${result.name}: install=${install}, audit=${audit}`);
}

const evaluation = evaluateSecurityAuditResults(results);
if (!evaluation.ok) {
  console.error(
    `\nBlocking workspace security audits: ${evaluation.failed.join(", ")}`,
  );
  process.exitCode = 1;
} else {
  console.log("\nAll workspace high/critical security audits passed.");
}
