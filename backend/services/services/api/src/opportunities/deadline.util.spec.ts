import {
  parseDeadlineDetailed,
  extractDeadlineText,
  pageSaysClosed,
} from "./deadline.util";

describe("parseDeadlineDetailed", () => {
  it("marks fully-stated dates as explicit", () => {
    const result = parseDeadlineDetailed("Deadline: 15 March 2027");
    expect(result).toEqual({ date: "2027-03-15", confidence: "explicit" });
  });

  it("marks year-less dates as inferred", () => {
    const result = parseDeadlineDetailed("March 15");
    expect(result.confidence).toBe("inferred");
    expect(result.date).toMatch(/^\d{4}-03-15$/);
  });

  it("marks title-year projections as inferred", () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    const result = parseDeadlineDetailed("April 30", nextYear);
    expect(result).toEqual({
      date: `${nextYear}-04-30`,
      confidence: "inferred",
    });
  });

  it("recognizes rolling deadlines", () => {
    expect(parseDeadlineDetailed("Applications are ongoing")).toEqual({
      date: null,
      confidence: "rolling",
    });
    expect(parseDeadlineDetailed("rolling basis")).toEqual({
      date: null,
      confidence: "rolling",
    });
  });

  it("returns unknown when nothing parses", () => {
    expect(parseDeadlineDetailed("see website for details")).toEqual({
      date: null,
      confidence: "unknown",
    });
    expect(parseDeadlineDetailed(null)).toEqual({
      date: null,
      confidence: "unknown",
    });
  });

  it("rejects implausible dates as unknown", () => {
    expect(parseDeadlineDetailed("2031-01-01").date).toBeNull();
    expect(parseDeadlineDetailed("2020-01-01").date).toBeNull();
  });
});

describe("extractDeadlineText", () => {
  it("finds deadline fragments in page text", () => {
    expect(
      extractDeadlineText("Some intro. Application deadline: 12 August 2026."),
    ).toContain("12 August 2026");
    expect(
      extractDeadlineText("Apply before 1 September 2026 to be considered"),
    ).toContain("1 September 2026");
  });

  it("prefers a complete source date over a shorter yearless deadline phrase", () => {
    const fragment = extractDeadlineText(
      "For the current competition, the main portfolio deadline is November 1, 2026. Stage 1 results follow later.",
    );

    expect(fragment).toContain("November 1, 2026");
    expect(parseDeadlineDetailed(fragment)).toEqual({
      date: "2026-11-01",
      confidence: "explicit",
    });
  });

  it("returns null when no deadline appears", () => {
    expect(
      extractDeadlineText("A great program for young leaders."),
    ).toBeNull();
  });
});

describe("pageSaysClosed", () => {
  it("detects explicit closure wording", () => {
    expect(pageSaysClosed("Applications are now closed.")).toBe(true);
    expect(pageSaysClosed("We are no longer accepting entries")).toBe(true);
  });

  it("does not treat a past date alone as closure", () => {
    expect(pageSaysClosed("Deadline was 1 April 2026")).toBe(false);
  });
});
