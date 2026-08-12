import { expect, it } from "vitest";
import { PAGE_SEO } from "../../lib/pageSeo.generated";

function expectRoutePreview(route: string, slug: string) {
  expect(PAGE_SEO[route]?.image).toBe(`https://www.edutu.org/og/${slug}.jpg`);
}

it("homepage uses its hero screenshot for shared links", () => {
  expectRoutePreview("/", "home");
});

it("opportunities uses its hero screenshot for shared links", () => {
  expectRoutePreview("/opportunities", "opportunities");
});

it("blog uses its hero screenshot for shared links", () => {
  expectRoutePreview("/blog", "blog");
});

it("community uses its hero screenshot for shared links", () => {
  expectRoutePreview("/community", "community");
});

it("about uses its hero screenshot for shared links", () => {
  expectRoutePreview("/about", "about");
});
