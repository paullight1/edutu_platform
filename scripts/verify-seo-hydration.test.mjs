import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [app, blogPage, opportunitiesPage] = await Promise.all([
  readFile(new URL("../edutu-web-app/src/App.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../edutu-web-app/src/components/BlogPage.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../edutu-web-app/src/components/OpportunitiesPageLegacy.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("canonical opportunity category URLs hydrate the public React route", () => {
  assert.match(app, /path="\/opportunities\/:category"/);
  assert.match(opportunitiesPage, /useParams/);
  assert.match(
    opportunitiesPage,
    /`\/opportunities\/\$\{collection\.categoryId\}`/,
  );
});

test("blog pagination remains addressable after React hydration", () => {
  assert.match(blogPage, /useSearchParams/);
  assert.match(blogPage, /fetchAllPublishedPosts/);
  assert.match(blogPage, /getPageHref=\{getPageHref\}/);
  assert.match(blogPage, /`\/blog\?page=\$\{page\}`/);
});

test("opportunity pagination remains addressable after React hydration", () => {
  assert.match(opportunitiesPage, /buildPageHref/);
  assert.match(opportunitiesPage, /getPageHref=\{getPageHref\}/);
  assert.match(opportunitiesPage, /useSearchParams/);
  assert.match(opportunitiesPage, /page > 1/);
});
