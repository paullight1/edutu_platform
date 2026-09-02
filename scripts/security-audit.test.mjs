import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "./security-lockfile-versions.test.mjs";

let securityAudit = {};
try {
  securityAudit = await import("./security-audit.mjs");
} catch {
  // RED phase: the assertions below describe the missing audit contract.
}

function requireExport(name) {
  assert.equal(
    typeof securityAudit[name],
    name === "SECURITY_AUDIT_TARGETS" ? "object" : "function",
    `scripts/security-audit.mjs must export ${name}`,
  );
  return securityAudit[name];
}

test("security audit plan includes every CI workspace", () => {
  const targets = requireExport("SECURITY_AUDIT_TARGETS");

  assert.deepEqual(
    targets.map((target) => target.name),
    ["backend", "admin", "web", "mobile"],
  );
  assert.deepEqual(
    targets.map((target) => target.installCwd),
    [
      "backend/services/services/api",
      "admin",
      "edutu-web-app",
      "edutumobile",
    ],
  );
  assert.deepEqual(targets.at(-1)?.audit, {
    cwd: ".",
    command: "node",
    args: ["scripts/check-mobile-audit.mjs"],
  });
});

test("audit result evaluation reports every failed workspace", () => {
  const evaluateSecurityAuditResults = requireExport(
    "evaluateSecurityAuditResults",
  );
  const result = evaluateSecurityAuditResults([
    { name: "backend", installStatus: 0, auditStatus: 1 },
    { name: "admin", installStatus: 0, auditStatus: 0 },
    { name: "web", installStatus: 1, auditStatus: null },
    { name: "mobile", installStatus: 0, auditStatus: 1 },
  ]);

  assert.deepEqual(result, {
    ok: false,
    failed: ["backend", "mobile", "web"],
  });
});

test("CI invokes the complete audit runner instead of stopping after backend", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /node scripts\/check-security-audits\.mjs/);
  assert.doesNotMatch(
    workflow,
    /cd backend\/services\/services\/api && npm ci && npm audit --audit-level=high/,
  );
});
