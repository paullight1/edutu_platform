import { articleText, opportunityUrlIdentity } from "./source-evidence.util";
import { extractDeadlineText } from "./deadline.util";

describe("opportunity source evidence", () => {
  it("keeps publication metadata explicitly separated from application deadlines", () => {
    const text = articleText(
      `<meta property="article:published_time" content="2026-10-08T09:00:00Z"><article><p>Applications are welcome from qualified students for this fellowship. No closing date has been announced.</p></article>`,
    );
    expect(text).toContain("Published: 2026-10-08");
    expect(extractDeadlineText(text)).toBeNull();
  });
  it("leaves conflicting application rounds for review", () => {
    expect(
      extractDeadlineText(
        "Deadline: October 15, 2026. Application deadline: November 11, 2026.",
      ),
    ).toBeNull();
  });
  it("keeps query identifiers and path case but removes tracking", () => {
    expect(
      opportunityUrlIdentity(
        "https://EXAMPLE.com/Apply?id=42&utm_source=x#top",
      ),
    ).toBe("https://example.com/Apply?id=42");
    expect(opportunityUrlIdentity("https://example.com/Apply?id=43")).not.toBe(
      opportunityUrlIdentity("https://example.com/Apply?id=42"),
    );
  });
  it("ignores deadlines in related opportunities and keeps the actual title", () => {
    const text = articleText(
      `<nav>Browse Internships</nav><article><h1>EBID Young Professional Program</h1><div class="entry-content"><p>Applications are open to young professionals. Posted October 8, 2026. More information is available from the bank.</p><div class="related-posts"><p>Deadline: October 30, 2026</p></div></div></article>`,
    );
    expect(text).toContain("EBID Young Professional Program");
    expect(text).not.toContain("Browse Internships");
    expect(extractDeadlineText(text)).toBeNull();
  });
  it("retains a deadline explicitly labeled in the article", () => {
    const text = articleText(
      `<article><p>Posted October 8, 2026. Applications are welcome from qualified candidates for this fellowship.</p><p>Application deadline: November 11, 2026</p></article>`,
    );
    expect(extractDeadlineText(text)).toBe("November 11, 2026");
  });
});
