import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HUES = ["blue", "purple", "teal", "green", "orange", "red", "neutral"];
const SUFFIXES = ["", "-soft", "-grad", "-glow"];

// Read from disk rather than importing the stylesheet. `__dirname` does not
// exist in this ESM package, `import.meta.url` is not a file:// URL under the
// jsdom environment, and a `?raw` import comes back empty because vitest stubs
// CSS by default. process.cwd() is vitest's root, i.e. admin/.
const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

function blockFor(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `${selector} block missing`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open, close);
}

describe("tokens.css", () => {
  it("declares all four tokens for every hue in light mode", () => {
    const light = blockFor(":root");
    for (const hue of HUES) {
      for (const suffix of SUFFIXES) {
        expect(light, `--hue-${hue}${suffix}`).toContain(`--hue-${hue}${suffix}:`);
      }
    }
  });

  it("overrides every hue in dark mode", () => {
    const dark = blockFor('[data-theme="dark"]');
    for (const hue of HUES) {
      expect(dark, `--hue-${hue} dark override`).toContain(`--hue-${hue}:`);
    }
  });

  it("preserves the four original dashboard card gradients", () => {
    expect(css).toContain("#2563eb");
    expect(css).toContain("#10b981");
    expect(css).toContain("#ff6600");
    expect(css).toContain("#ef4444");
  });
});
