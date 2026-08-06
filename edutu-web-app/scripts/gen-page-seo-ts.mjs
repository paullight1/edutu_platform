/**
 * Codegen `src/lib/pageSeo.generated.ts` from `scripts/page-seo.mjs`.
 *
 * Keeps the runtime <Seo> component (what Google reads after hydration) on the
 * exact same image/title/description as the prerendered HTML (what social
 * crawlers read). Two hand-maintained copies of this data would drift, and the
 * drift is invisible until someone shares a link.
 *
 * Runs automatically via `prebuild`. Never edit the generated file.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_SEO, ogImageUrl } from "./page-seo.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(
  scriptDir,
  "..",
  "src",
  "lib",
  "pageSeo.generated.ts",
);

const entries = PAGE_SEO.map(
  (entry) => `  ${JSON.stringify(entry.path)}: {
    slug: ${JSON.stringify(entry.slug)},
    title: ${JSON.stringify(entry.title)},
    description: ${JSON.stringify(entry.description)},
    image: ${JSON.stringify(ogImageUrl(entry.slug))},
    imageAlt: ${JSON.stringify(entry.imageAlt)},
  },`,
).join("\n");

const source = `/**
 * GENERATED FILE — do not edit.
 *
 * Source: scripts/page-seo.mjs
 * Regenerate: npm run seo:pages (runs automatically on prebuild)
 */

export interface PageSeoEntry {
  slug: string;
  title: string;
  description: string;
  /** Absolute URL of the page's prerendered hero Open Graph image. */
  image: string;
  imageAlt: string;
}

export const PAGE_SEO: Record<string, PageSeoEntry> = {
${entries}
};
`;

await writeFile(outputPath, source);
console.log(`[seo] wrote ${path.relative(process.cwd(), outputPath)}`);
