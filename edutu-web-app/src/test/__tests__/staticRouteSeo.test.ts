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

it("impact uses its hero screenshot for shared links", () => {
  expectRoutePreview("/impact", "impact");
});

it("edutu for you uses its hero screenshot for shared links", () => {
  expectRoutePreview("/edutuforyou", "edutu-for-you");
});

it("events uses its hero screenshot for shared links", () => {
  expectRoutePreview("/events", "events");
});

it("download uses its hero screenshot for shared links", () => {
  expectRoutePreview("/download", "download");
});

it("what we believe uses its hero screenshot for shared links", () => {
  expectRoutePreview("/what-we-believe", "what-we-believe");
});

it("upgrade uses its hero screenshot for shared links", () => {
  expectRoutePreview("/upgrade", "upgrade");
});

it("mentor uses its hero screenshot for shared links", () => {
  expectRoutePreview("/mentor", "mentor");
});

it("scholarship engine uses its hero screenshot for shared links", () => {
  expectRoutePreview("/scholarship-engine", "scholarship-engine");
});

it("scholarship api uses its hero screenshot for shared links", () => {
  expectRoutePreview("/scholarship-api", "scholarship-api");
});

it("developers uses its hero screenshot for shared links", () => {
  expectRoutePreview("/developers", "developers");
});

it("developer docs uses its hero screenshot for shared links", () => {
  expectRoutePreview("/developers/docs", "developers-docs");
});

it("help uses its hero screenshot for shared links", () => {
  expectRoutePreview("/help", "help");
});

it("careers uses its hero screenshot for shared links", () => {
  expectRoutePreview("/careers", "careers");
});

it("privacy uses its hero screenshot for shared links", () => {
  expectRoutePreview("/privacy", "privacy");
});
