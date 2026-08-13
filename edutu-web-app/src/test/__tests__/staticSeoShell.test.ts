import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("static SEO shell", () => {
  it("uses the homepage screenshot for crawler-visible social previews", () => {
    const shell = readFileSync(path.join(repoRoot, "index.html"), "utf8");

    expect(shell).toContain('property="og:url"');
    expect(shell).toContain("https://www.edutu.org/");
    expect(shell).toContain("https://www.edutu.org/og/home.jpg");
    expect(shell).not.toContain(
      'property="og:image"\n      content="https://www.edutu.org/icons/icon-512x512.png"',
    );
    expect(shell).not.toContain(
      'name="twitter:image"\n      content="https://www.edutu.org/icons/icon-512x512.png"',
    );
  });
});
