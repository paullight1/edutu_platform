import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pagePath = resolve(root, "admin/src/pages/Opportunities.tsx");
const budgetPath = resolve(root, "scripts/check-large-file-budgets.mjs");
const scriptPath = resolve(root, "scripts/phase3-opportunities-api-refactor.mjs");

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
  "  useRef,\n  type ChangeEvent,",
  "  useRef,\n  useMemo,\n  type ChangeEvent,",
  "React useMemo import anchor",
);

const domainImportEnd = '} from "./opportunities/opportunity-domain";\n';
const apiImport = 'import { createOpportunityAdminApi } from "./opportunities/opportunity-admin-api";\n';
if (!page.includes(apiImport)) {
  const anchor = requireOnce(page, domainImportEnd, "domain import end");
  const insertAt = anchor + domainImportEnd.length;
  page = page.slice(0, insertAt) + apiImport + page.slice(insertAt);
}

const headersBlock = `  const getAdminHeaders = useCallback(async () => {\n    return getAdminAuthHeaders({\n      "Content-Type": "application/json",\n    });\n  }, []);\n`;
const clientBlock = `${headersBlock}\n  const opportunityAdminApi = useMemo(\n    () =>\n      createOpportunityAdminApi({\n        baseUrl: NEST_API_URL,\n        getHeaders: getAdminHeaders,\n      }),\n    [getAdminHeaders, NEST_API_URL],\n  );\n`;
page = replaceOnce(page, headersBlock, clientBlock, "admin headers block");

const scraperFetch = `      const response = await fetch(\`${"${NEST_API_URL}"}/api/scraper/run\`, {\n        method: "POST",\n        headers: await getAdminHeaders(),\n        signal: controller.signal,\n        body: JSON.stringify({\n          allSources: true,\n          maxPages: 3,\n        }),\n      });`;
const scraperClient = `      const result = await opportunityAdminApi.runScraper(\n        { allSources: true, maxPages: 3 },\n        controller.signal,\n      );`;
page = replaceOnce(page, scraperFetch, scraperClient, "scraper fetch");
page = replaceOnce(
  page,
  "      const result = await response.json();\n\n      if (\n        response.ok &&\n        result.success &&",
  "\n      if (\n        result.success &&",
  "scraper response parsing",
);

page = replaceOnce(
  page,
  "\n      const headers = await getAdminHeaders();\n      const batches: Array<Array<Record<string, unknown>>> = [];",
  "\n      const batches: Array<Array<Record<string, unknown>>> = [];",
  "bulk import headers",
);

const bulkFetch = `        const response = await fetch(\n          \`${"${NEST_API_URL}"}/opportunities/admin/bulk-import\`,\n          {\n            method: "POST",\n            headers,\n            body: JSON.stringify({ items: batch }),\n          },\n        );\n\n        const result = await response.json().catch(() => ({}));\n\n        if (!response.ok || !result.success) {\n          throw new Error(result.error || \`Save failed for batch ${"${index + 1}"}\`);\n        }`;
page = replaceOnce(
  page,
  bulkFetch,
  "        const result = await opportunityAdminApi.bulkImport(batch);",
  "bulk import fetch",
);

page = replaceOnce(
  page,
  "\n    const headers = await getAdminHeaders();\n\n    const improved: OpportunityPreviewItem[] = [];",
  "\n    const improved: OpportunityPreviewItem[] = [];",
  "enhance preview headers",
);

const enhanceFetch = `        const response = await fetch(\n          \`${"${NEST_API_URL}"}/api/scraper/enhance-preview\`,\n          {\n            method: "POST",\n            headers,\n            body: JSON.stringify(opp),\n          },\n        );\n\n        const result = await response.json().catch(() => null);\n        if (!response.ok || !result?.success) {`;
page = replaceOnce(
  page,
  enhanceFetch,
  `        const result = await opportunityAdminApi.enhancePreview(opp);\n        if (!result?.success) {`,
  "enhance preview fetch",
);

const listTransport = `      const headers = await getAdminHeaders();\n      const [listResponse, statsResponse] = await Promise.all([\n        fetch(\`${"${NEST_API_URL}"}/opportunities/admin/list?${"${params.toString()}"}\`, {\n          headers,\n        }),\n        fetch(\`${"${NEST_API_URL}"}/opportunities/admin/stats\`, {\n          headers,\n        }),\n      ]);\n\n      if (!listResponse.ok) {\n        const error = await listResponse.json().catch(() => ({}));\n        throw new Error(error.message || "Failed to load opportunities");\n      }\n\n      const result = (await listResponse.json()) as OpportunityListResponse;`;
page = replaceOnce(
  page,
  listTransport,
  `      const { list: result, stats: nextStats } =\n        await opportunityAdminApi.loadListAndStats(params);`,
  "list transport",
);
page = replaceOnce(
  page,
  `      if (statsResponse.ok) {\n        setStats(await statsResponse.json());\n      }`,
  `      if (nextStats) {\n        setStats(nextStats);\n      }`,
  "stats parsing",
);
page = replaceOnce(
  page,
  "  }, [buildListParams, currentPage, getAdminHeaders, NEST_API_URL, pageSize]);",
  "  }, [buildListParams, currentPage, opportunityAdminApi, pageSize]);",
  "fetch opportunities dependencies",
);

if (page.includes("const response = await fetch(`${NEST_API_URL}/api/scraper/run`")) {
  throw new Error("Scraper transport was not removed");
}
if (page.includes("const [listResponse, statsResponse] = await Promise.all")) {
  throw new Error("List transport was not removed");
}

await writeFile(pagePath, page, "utf8");

const lineCount =
  page.length === 0
    ? 0
    : page.split(/\r?\n/u).length - (page.endsWith("\n") ? 1 : 0);
if (lineCount >= 4743) {
  throw new Error(`Expected Opportunities.tsx below 4743 lines, got ${lineCount}`);
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
console.log(`Extracted opportunity transport; Opportunities.tsx is now ${lineCount} lines.`);
