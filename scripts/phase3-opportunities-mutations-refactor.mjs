import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pagePath = resolve(root, "admin/src/pages/Opportunities.tsx");
const budgetPath = resolve(root, "scripts/check-large-file-budgets.mjs");
const scriptPath = resolve(root, "scripts/phase3-opportunities-mutations-refactor.mjs");

function requireOnce(source, marker, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (first !== last) throw new Error(`Ambiguous ${label}`);
  return first;
}

function replaceOnce(source, before, after, label) {
  requireOnce(source, before, label);
  return source.replace(before, after);
}

let page = await readFile(pagePath, "utf8");

page = replaceOnce(
  page,
  `      const response = await fetch(\`${"${NEST_API_URL}"}/opportunities/${"${id}"}\`, {\n        method: "DELETE",\n        headers: await getAdminHeaders(),\n      });\n      if (!response.ok) {\n        const error = await response.json().catch(() => ({}));\n        throw new Error(error.message || "Failed to delete opportunity");\n      }`,
  `      await opportunityAdminApi.deleteOpportunity(id);`,
  "single delete transport",
);

page = replaceOnce(
  page,
  `      const response = await fetch(\n        \`${"${NEST_API_URL}"}/opportunities/${"${id}"}/status\`,\n        {\n          method: "PATCH",\n          headers: await getAdminHeaders(),\n          body: JSON.stringify({ status }),\n        },\n      );\n      if (!response.ok) {\n        const error = await response.json().catch(() => ({}));\n        throw new Error(error.message || "Failed to update status");\n      }`,
  `      await opportunityAdminApi.updateStatus(id, status);`,
  "single status transport",
);

page = replaceOnce(
  page,
  `        const response = await fetch(\n          \`${"${NEST_API_URL}"}/opportunities/admin/bulk-status\`,\n          {\n            method: "POST",\n            headers: await getAdminHeaders(),\n            body: JSON.stringify({ ids: chunk, status }),\n          },\n        );\n        if (!response.ok) {\n          const error = await response.json().catch(() => ({}));\n          throw new Error(error.message || "Bulk status update failed");\n        }\n        const result = await response.json().catch(() => ({}));`,
  `        const result = await opportunityAdminApi.bulkStatus(chunk, status);`,
  "bulk status transport",
);

page = replaceOnce(
  page,
  `        const response = await fetch(\n          \`${"${NEST_API_URL}"}/opportunities/admin/bulk-category\`,\n          {\n            method: "POST",\n            headers: await getAdminHeaders(),\n            body: JSON.stringify({ ids: chunk, category }),\n          },\n        );\n        if (!response.ok) {\n          const error = await response.json().catch(() => ({}));\n          throw new Error(error.message || "Bulk category move failed");\n        }\n        const result = await response.json().catch(() => ({}));`,
  `        const result = await opportunityAdminApi.bulkCategory(chunk, category);`,
  "bulk category transport",
);

page = replaceOnce(
  page,
  `        const response = await fetch(\n          \`${"${NEST_API_URL}"}/opportunities/admin/bulk-delete\`,\n          {\n            method: "POST",\n            headers: await getAdminHeaders(),\n            body: JSON.stringify({ ids: chunk }),\n          },\n        );\n        if (!response.ok) {\n          const error = await response.json().catch(() => ({}));\n          throw new Error(error.message || "Bulk delete failed");\n        }\n        const result = await response.json().catch(() => ({}));`,
  `        const result = await opportunityAdminApi.bulkDelete(chunk);`,
  "bulk delete transport",
);

page = replaceOnce(
  page,
  `      const response = await fetch(\n        \`${"${NEST_API_URL}"}/opportunities/admin/${"${id}"}/enhance\`,\n        {\n          method: "POST",\n          headers: await getAdminHeaders(),\n        },\n      );\n      const result = await response.json();\n      if (!response.ok || !result.success) {\n        throw new Error(result.error || "AI enhancement failed");\n      }`,
  `      const result = await opportunityAdminApi.enhanceOpportunity(id);`,
  "single enhancement transport",
);

page = replaceOnce(
  page,
  `      const response = await fetch(\n        \`${"${NEST_API_URL}"}/opportunities/admin/verification/${"${id}"}\`,\n        {\n          method: "POST",\n          headers: {\n            ...(await getAdminHeaders()),\n            "Content-Type": "application/json",\n          },\n          body: JSON.stringify({ dryRun: false }),\n        },\n      );\n      const result = await response.json().catch(() => ({}));\n      if (!response.ok || !result.success) {\n        throw new Error(result.error || "Deadline check failed");\n      }`,
  `      const result = await opportunityAdminApi.verifyOpportunity(id);`,
  "single deadline verification transport",
);

page = replaceOnce(
  page,
  `          const response = await fetch(\n            \`${"${NEST_API_URL}"}/opportunities/admin/verification/bulk\`,\n            {\n              method: "POST",\n              headers: await getAdminHeaders(),\n              body: JSON.stringify({ ids: chunk, dryRun: false }),\n            },\n          );\n          const result = await response.json().catch(() => ({}));\n          if (!response.ok || !result.success) {\n            throw new Error(\n              result.error || result.message || "Deadline check failed",\n            );\n          }`,
  `          const result = await opportunityAdminApi.verifyOpportunities(chunk);`,
  "bulk deadline verification transport",
);

page = replaceOnce(
  page,
  `          const response = await fetch(\n            \`${"${NEST_API_URL}"}/opportunities/admin/${"${id}"}/enhance\`,\n            {\n              method: "POST",\n              headers: await getAdminHeaders(),\n            },\n          );\n          const result = await response.json().catch(() => ({}));\n          if (!response.ok || !result.success) {\n            throw new Error(result.error || "AI enhancement failed");\n          }\n          completed += 1;`,
  `          await opportunityAdminApi.enhanceOpportunity(id);\n          completed += 1;`,
  "bulk enhancement transport",
);

page = replaceOnce(
  page,
  `      const response = await fetch(\n        \`${"${NEST_API_URL}"}/opportunities/admin/${"${opp.id}"}/enhance\`,\n        {\n          method: "POST",\n          headers: await getAdminHeaders(),\n        },\n      );\n      const result = (await response\n        .json()\n        .catch(() => ({}))) as EnhanceOpportunityResponse;\n\n      if (!response.ok || !result.success || !result.opportunity) {`,
  `      const result = await opportunityAdminApi.enhanceOpportunity(opp.id);\n\n      if (!result.opportunity) {`,
  "share enhancement transport",
);

page = page.replace("  type EnhanceOpportunityResponse,\n", "");

const retiredMarkers = [
  "/opportunities/admin/bulk-status",
  "/opportunities/admin/bulk-category",
  "/opportunities/admin/bulk-delete",
  "/opportunities/admin/verification/",
  "/opportunities/admin/${id}/enhance",
  "/opportunities/admin/${opp.id}/enhance",
];
for (const marker of retiredMarkers) {
  if (page.includes(marker)) {
    throw new Error(`Mutation transport still present in page: ${marker}`);
  }
}

await writeFile(pagePath, page, "utf8");

const lineCount =
  page.length === 0
    ? 0
    : page.split(/\r?\n/u).length - (page.endsWith("\n") ? 1 : 0);
if (lineCount >= 4708) {
  throw new Error(`Expected Opportunities.tsx below 4708 lines, got ${lineCount}`);
}

let budgets = await readFile(budgetPath, "utf8");
const budgetPattern = /"admin\/src\/pages\/Opportunities\.tsx":\s*\d+/u;
if (!budgetPattern.test(budgets)) throw new Error("Opportunity line budget entry not found");
budgets = budgets.replace(
  budgetPattern,
  `"admin/src/pages/Opportunities.tsx": ${lineCount}`,
);
await writeFile(budgetPath, budgets, "utf8");

await unlink(scriptPath);
console.log(`Extracted mutation transport; Opportunities.tsx is now ${lineCount} lines.`);
