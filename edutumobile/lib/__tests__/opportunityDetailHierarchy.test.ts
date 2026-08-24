import fs from "node:fs";
import path from "node:path";

describe("opportunity detail information hierarchy", () => {
  it("shows core facts and application details before optional AI support", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app", "(app)", "opportunities", "[id].tsx"),
      "utf8",
    );

    const facts = source.indexOf("/* ── FACTS");
    const reference = source.indexOf("/* ── REFERENCE");
    const support = source.indexOf("/* ── APPLICATION SUPPORT");
    const publisherRoadmap = source.indexOf(
      "Publisher-supplied preparation steps",
    );

    expect(facts).toBeGreaterThan(-1);
    expect(reference).toBeGreaterThan(facts);
    expect(support).toBeGreaterThan(reference);
    expect(publisherRoadmap).toBeGreaterThan(support);

    expect(source.indexOf("<FitPanel", support)).toBeGreaterThan(support);
    expect(source.indexOf("<AiActionBar", support)).toBeGreaterThan(support);
    expect(source.indexOf("<DocumentUpload", support)).toBeGreaterThan(support);
  });
});
