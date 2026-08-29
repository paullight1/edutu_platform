import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hideKeyboard, initializeCapacitor } from "./capacitor";

const originalVisualViewport = Object.getOwnPropertyDescriptor(
  window,
  "visualViewport",
);
const originalInnerHeight = Object.getOwnPropertyDescriptor(
  window,
  "innerHeight",
);

function installVisualViewport(height = 500) {
  const viewport = new EventTarget() as VisualViewport;
  Object.defineProperties(viewport, {
    height: { configurable: true, value: height },
    offsetTop: { configurable: true, value: 0 },
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
  return viewport;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.classList.remove("keyboard-visible");
  document.body.style.removeProperty("--keyboard-height");
  document.body.style.removeProperty("--keyboard-offset");
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalVisualViewport) {
    Object.defineProperty(window, "visualViewport", originalVisualViewport);
  } else {
    Reflect.deleteProperty(window, "visualViewport");
  }
  if (originalInnerHeight) {
    Object.defineProperty(window, "innerHeight", originalInnerHeight);
  }
});

describe("global keyboard interactions", () => {
  it("tracks the mobile viewport and keeps the focused field visible", async () => {
    const viewport = installVisualViewport();
    const scrollIntoView = vi.fn();
    const input = document.createElement("input");
    input.scrollIntoView = scrollIntoView;
    document.body.appendChild(input);

    const cleanup = await initializeCapacitor({});
    input.focus();
    viewport.dispatchEvent(new Event("resize"));

    expect(document.body).toHaveClass("keyboard-visible");
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      "300px",
    );
    expect(document.body.style.getPropertyValue("--keyboard-offset")).toBe(
      "300px",
    );
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });

    cleanup();
  });

  it("dismisses a focused field when the user taps outside its form", async () => {
    installVisualViewport(800);
    const form = document.createElement("form");
    const input = document.createElement("input");
    const submit = document.createElement("button");
    const outside = document.createElement("div");
    form.append(input, submit);
    document.body.append(form, outside);
    const cleanup = await initializeCapacitor({});

    input.focus();
    submit.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(document.activeElement).toBe(input);

    form.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(document.activeElement).not.toBe(input);

    input.focus();
    outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(document.activeElement).not.toBe(input);

    cleanup();
  });

  it("hideKeyboard also blurs editable fields on the web", async () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    await hideKeyboard();

    expect(document.activeElement).not.toBe(textarea);
  });
});
