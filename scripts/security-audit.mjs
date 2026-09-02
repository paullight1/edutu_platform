export const SECURITY_AUDIT_TARGETS = Object.freeze([
  Object.freeze({
    name: "backend",
    installCwd: "backend/services/services/api",
    audit: Object.freeze({
      cwd: "backend/services/services/api",
      command: "npm",
      args: Object.freeze(["audit", "--audit-level=high"]),
    }),
  }),
  Object.freeze({
    name: "admin",
    installCwd: "admin",
    audit: Object.freeze({
      cwd: "admin",
      command: "npm",
      args: Object.freeze(["audit", "--audit-level=high"]),
    }),
  }),
  Object.freeze({
    name: "web",
    installCwd: "edutu-web-app",
    audit: Object.freeze({
      cwd: "edutu-web-app",
      command: "npm",
      args: Object.freeze(["audit", "--audit-level=high"]),
    }),
  }),
  Object.freeze({
    name: "mobile",
    installCwd: "edutumobile",
    audit: Object.freeze({
      cwd: ".",
      command: "node",
      args: Object.freeze(["scripts/check-mobile-audit.mjs"]),
    }),
  }),
]);

export function evaluateSecurityAuditResults(results) {
  const failed = new Set();

  for (const result of results ?? []) {
    if (!result || typeof result.name !== "string") continue;
    if (result.installStatus !== 0 || result.auditStatus !== 0) {
      failed.add(result.name);
    }
  }

  const failedNames = [...failed].sort();
  return {
    ok: failedNames.length === 0,
    failed: failedNames,
  };
}
