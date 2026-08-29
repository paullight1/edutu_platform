import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(name: string): string {
  return readFileSync(resolve(process.cwd(), "src/components", name), "utf8");
}

describe("settings mobile presentation", () => {
  it("uses shadowless grouped lists and full-row notification switches", () => {
    const page = source("SettingsPage.tsx");
    const member = source("MemberSettingsPanel.tsx");
    const push = source("WebPushSettings.tsx");
    const reminder = source("ReminderSettings.tsx");

    expect(page).toContain("Preferences");
    expect(page).toContain("Notifications");
    expect(page).not.toContain("shadow-soft");
    expect(member).toContain("Danger zone");
    expect(member).not.toContain("uppercase tracking-[0.18em]");
    expect(push).toContain('role="switch"');
    expect(push).toContain("min-h-11 w-full");
    expect(reminder).toContain("min-h-11 w-full");
  });
});
