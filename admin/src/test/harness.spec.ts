import { describe, expect, it } from "vitest";

/**
 * Guards the test harness itself. If `setupFiles` stops loading, or the jsdom
 * environment is lost, this fails with an obvious message instead of surfacing
 * as a confusing failure inside an unrelated suite.
 */
describe("test harness", () => {
  it("provides a jsdom document", () => {
    expect(typeof document).toBe("object");
    expect(document.body).toBeTruthy();
  });

  it("loads the jest-dom matchers from setupFiles", () => {
    const el = document.createElement("div");
    el.textContent = "ready";
    document.body.appendChild(el);

    // Both matchers come from @testing-library/jest-dom, not from vitest.
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("ready");
  });
});
