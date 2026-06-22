import { describe, expect, it } from "vitest";
import { normalizeExternalUrl } from "../../lib/externalUrl";

describe("normalizeExternalUrl", () => {
  it("keeps valid http and https links", () => {
    expect(normalizeExternalUrl("https://example.com/apply")).toBe(
      "https://example.com/apply",
    );
    expect(normalizeExternalUrl("http://example.com/apply")).toBe(
      "http://example.com/apply",
    );
  });

  it("adds https to common application link formats", () => {
    expect(normalizeExternalUrl("www.example.com/apply")).toBe(
      "https://www.example.com/apply",
    );
    expect(normalizeExternalUrl("example.com/apply?ref=edutu")).toBe(
      "https://example.com/apply?ref=edutu",
    );
    expect(normalizeExternalUrl("//example.com/apply")).toBe(
      "https://example.com/apply",
    );
  });

  it("extracts links from scraped text and rejects unsafe schemes", () => {
    expect(normalizeExternalUrl("Apply here: https://example.com/apply.")).toBe(
      "https://example.com/apply",
    );
    expect(normalizeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeExternalUrl("not a link")).toBeUndefined();
  });
});
