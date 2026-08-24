import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.env.GITHUB_WORKSPACE || process.cwd();

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected source for ${label}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one source match for ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function update(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const output = transform(source);
  if (output === source) {
    throw new Error(`No change produced for ${relativePath}`);
  }
  await writeFile(filePath, output, "utf8");
}

await update(
  "backend/services/services/api/src/opportunities/opportunity-content-normalizer.ts",
  (source) => {
    let output = replaceOnce(
      source,
      "const CONTROL_CHAR_RE = /[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]/g;\n",
      "",
      "control-character regular expression",
    );

    output = replaceOnce(
      output,
      'const EMAIL_ONLY_RE = /^\\s*[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}\\s*$/i;\n',
      `const EMAIL_ONLY_RE = /^\\s*[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}\\s*$/i;\n\nfunction stripControlCharacters(value: string): string {\n  let result = \"\";\n  for (const character of value) {\n    const code = character.codePointAt(0) ?? 0;\n    const isControl =\n      (code >= 0x00 && code <= 0x08) ||\n      code === 0x0b ||\n      code === 0x0c ||\n      (code >= 0x0e && code <= 0x1f) ||\n      (code >= 0x7f && code <= 0x9f);\n    if (!isControl) result += character;\n  }\n  return result;\n}\n`,
      "control-character helper insertion",
    );

    output = replaceOnce(
      output,
      '  const decoded = decodeHtmlEntities(raw)\n    .replace(CONTROL_CHAR_RE, \"\")\n    .replace(BLOCK_TAG_RE, \"\\n\")',
      '  const decoded = stripControlCharacters(decodeHtmlEntities(raw))\n    .replace(BLOCK_TAG_RE, \"\\n\")',
      "narrative control-character cleanup",
    );

    output = replaceOnce(
      output,
      '  const candidates = flattenUnknown(value).flatMap((entry) =>\n    decodeHtmlEntities(entry)\n      .replace(CONTROL_CHAR_RE, \"\")\n      .replace(BLOCK_TAG_RE, \"\\n\")',
      '  const candidates = flattenUnknown(value).flatMap((entry) =>\n    stripControlCharacters(decodeHtmlEntities(entry))\n      .replace(BLOCK_TAG_RE, \"\\n\")',
      "list control-character cleanup",
    );

    return output;
  },
);

await update(
  "backend/services/services/api/src/opportunities/opportunity-content-refinement-policy.ts",
  (source) =>
    replaceOnce(
      source,
      "  if (mutable[POLICY_MARK]) return mutable[POLICY_MARK]!.restore;",
      "  const currentPolicy = mutable[POLICY_MARK];\n  if (currentPolicy) return currentPolicy.restore;",
      "policy state narrowing",
    ),
);

await update(
  "backend/services/services/api/src/opportunities/opportunity-content-refinement-policy.spec.ts",
  (source) => {
    let output = replaceOnce(
      source,
      "      async enhanceOpportunity(id: string) {\n        originalCalls.push(`original:${id}`);\n        return { success: true, id };\n      },",
      "      enhanceOpportunity: async (id: string) => {\n        originalCalls.push(`original:${id}`);\n        return { success: true, id };\n      },",
      "enhance test double",
    );
    output = replaceOnce(
      output,
      "      async backfillEnrichment(options: { limit?: number } = {}) {\n        return { processed: options.limit ?? 0 };\n      },",
      "      backfillEnrichment: async (options: { limit?: number } = {}) => {\n        return { processed: options.limit ?? 0 };\n      },",
      "backfill test double",
    );
    return output;
  },
);

const oldTestPath = path.join(
  root,
  "edutumobile/components/opportunity/CollapsibleSection.test.tsx",
);
const newTestPath = path.join(
  root,
  "edutumobile/components/opportunity/__tests__/CollapsibleSection.test.tsx",
);
let testSource = await readFile(oldTestPath, "utf8");
testSource = replaceOnce(
  testSource,
  'from "./CollapsibleSection"',
  'from "../CollapsibleSection"',
  "moved component import",
);
testSource = replaceOnce(
  testSource,
  'jest.mock("../context/ThemeContext"',
  'jest.mock("../../context/ThemeContext"',
  "moved theme mock",
);
testSource = replaceOnce(
  testSource,
  'jest.mock("../ui/AnimatedPressable"',
  'jest.mock("../../ui/AnimatedPressable"',
  "moved pressable mock",
);
await mkdir(path.dirname(newTestPath), { recursive: true });
await writeFile(newTestPath, testSource, "utf8");
await rm(oldTestPath);

console.log("Applied semantic lint fixes and moved the colocated mobile test.");
