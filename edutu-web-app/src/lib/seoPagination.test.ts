import { describe, expect, it } from "vitest";
import { buildPageHref, parsePageParam } from "./seoPagination";

describe("parsePageParam", () => {
  it("accepts positive integer page numbers", () => {
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam("12")).toBe(12);
  });

  it("falls back to page one for invalid input", () => {
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-4")).toBe(1);
    expect(parsePageParam("2.5")).toBe(1);
    expect(parsePageParam("not-a-page")).toBe(1);
  });

  it("clamps a valid page to a known total", () => {
    expect(parsePageParam("8", 3)).toBe(3);
    expect(parsePageParam("2", 3)).toBe(2);
  });
});

describe("buildPageHref", () => {
  it("preserves existing query parameters and adds the page", () => {
    expect(
      buildPageHref(
        "/blog",
        new URLSearchParams("topic=ai&level=beginner"),
        3,
      ),
    ).toBe("/blog?topic=ai&level=beginner&page=3");
  });

  it("removes the page parameter for the canonical first page", () => {
    expect(
      buildPageHref("/blog", new URLSearchParams("topic=ai&page=4"), 1),
    ).toBe("/blog?topic=ai");
    expect(buildPageHref("/blog", new URLSearchParams("page=2"), 1)).toBe(
      "/blog",
    );
  });
});
