import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissWebPushPrompt,
  isWebPushPromptDismissed,
  resetWebPushPrompt,
  webPushPromptKey,
} from "../../lib/webPushPrompt";

describe("webPushPrompt dismissal memory", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is not dismissed by default", () => {
    expect(isWebPushPromptDismissed("saved")).toBe(false);
  });

  it("persists a dismissal under a namespaced key", () => {
    dismissWebPushPrompt("saved");

    expect(isWebPushPromptDismissed("saved")).toBe(true);
    expect(
      window.localStorage.getItem("edutu:webpush-prompt-dismissed:saved"),
    ).toBe("1");
    expect(webPushPromptKey("saved")).toBe(
      "edutu:webpush-prompt-dismissed:saved",
    );
  });

  it("keeps dismissals independent per surface", () => {
    dismissWebPushPrompt("saved");

    expect(isWebPushPromptDismissed("deadlines")).toBe(false);
  });

  it("can be reset", () => {
    dismissWebPushPrompt("deadlines");
    resetWebPushPrompt("deadlines");

    expect(isWebPushPromptDismissed("deadlines")).toBe(false);
  });
});
