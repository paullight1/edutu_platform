import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pagePath = resolve(root, "admin/src/pages/Opportunities.tsx");
const budgetPath = resolve(root, "scripts/check-large-file-budgets.mjs");
const workflowPath = resolve(root, ".github/workflows/ci.yml");
const scriptPath = resolve(root, "scripts/phase3-opportunities-domain-refactor.mjs");

function requireOnce(source, marker, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0) throw new Error(`Missing ${label} marker`);
  if (first !== last) throw new Error(`Ambiguous ${label} marker`);
  return first;
}

function removeRange(source, startMarker, endMarker, label) {
  const start = requireOnce(source, startMarker, `${label} start`);
  const end = requireOnce(source, endMarker, `${label} end`);
  if (end <= start) throw new Error(`Invalid ${label} range`);
  return source.slice(0, start) + source.slice(end);
}

let page = await readFile(pagePath, "utf8");

const statusImport = `import {\n  deadlineDisplay,\n  effectiveStatus,\n  formatOpportunityDate,\n  isExpiredOpportunity,\n  isPastDate,\n} from "./opportunities/opportunity-status";\n`;
const domainImport = `import {\n  BULK_MOVE_CATEGORIES,\n  buildOpportunityPayload,\n  chunkArray,\n  describeVerification,\n  getErrorMessage,\n  guessTitleFromUrl,\n  mapPreviewToFormValues,\n  normalizeOpportunityStatus,\n  normalizeText,\n  truncateText,\n  type BulkActionKind,\n  type BulkPreviewItem,\n  type BulkProgress,\n  type CreationMode,\n  type EnhanceOpportunityResponse,\n  type Opportunity,\n  type OpportunityFormValues,\n  type OpportunityListResponse,\n  type OpportunityPreviewItem,\n  type OpportunityShareCard,\n  type OpportunityShareResponse,\n  type OpportunityStatus,\n  type PageNotice,\n  type Stats,\n  type ViewMode,\n} from "./opportunities/opportunity-domain";\n`;

if (!page.includes(domainImport)) {
  const anchor = requireOnce(page, statusImport, "opportunity-status import");
  const insertAt = anchor + statusImport.length;
  page = page.slice(0, insertAt) + domainImport + page.slice(insertAt);
}

page = removeRange(
  page,
  "interface Opportunity {",
  'const PUBLIC_WEB_APP_FALLBACK_URL = "https://edutu.org";',
  "domain types/constants",
);
page = removeRange(
  page,
  "function getErrorMessage(",
  "function getPublicAppBaseUrl()",
  "text/error/verification helpers",
);
page = removeRange(
  page,
  "function guessTitleFromUrl(",
  "export default function Opportunities() {",
  "form/payload helpers",
);

if (page.includes("interface Opportunity {") || page.includes("function buildOpportunityPayload(")) {
  throw new Error("Opportunity domain extraction left duplicate declarations in the page");
}

await writeFile(pagePath, page, "utf8");

const lineCount =
  page.length === 0
    ? 0
    : page.split(/\r?\n/u).length - (page.endsWith("\n") ? 1 : 0);
if (lineCount >= 5175) {
  throw new Error(`Expected Opportunities.tsx to shrink below 5175 lines, got ${lineCount}`);
}

let budgets = await readFile(budgetPath, "utf8");
const budgetPattern = /"admin\/src\/pages\/Opportunities\.tsx":\s*\d+/u;
if (!budgetPattern.test(budgets)) throw new Error("Opportunity line budget entry not found");
budgets = budgets.replace(
  budgetPattern,
  `"admin/src/pages/Opportunities.tsx": ${lineCount}`,
);
await writeFile(budgetPath, budgets, "utf8");

let workflow = await readFile(workflowPath, "utf8");
const beginMarker = "  # BEGIN PHASE3_OPPORTUNITY_DOMAIN_APPLY\n";
const endMarker = "  # END PHASE3_OPPORTUNITY_DOMAIN_APPLY\n";
const begin = requireOnce(workflow, beginMarker, "temporary workflow begin");
const end = requireOnce(workflow, endMarker, "temporary workflow end");
workflow = workflow.slice(0, begin) + workflow.slice(end + endMarker.length);
await writeFile(workflowPath, workflow, "utf8");

await unlink(scriptPath);

console.log(`Extracted opportunity domain helpers; Opportunities.tsx is now ${lineCount} lines.`);
