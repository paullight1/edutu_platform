import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "../../components/SettingsPage";

vi.mock("../../hooks/usePersonalization", () => ({
  usePersonalization: () => ({
    preferences: { interests: ["technology"], careerGoals: ["engineering"] },
  }),
}));

vi.mock("../../components/AppearanceSettings", () => ({
  default: () => <div>Appearance control</div>,
}));
vi.mock("../../components/WebPushSettings", () => ({
  default: () => <div>New matches control</div>,
}));
vi.mock("../../components/ReminderSettings", () => ({
  default: () => <div>Deadline reminders control</div>,
}));
vi.mock("../../components/LanguageSwitcher", () => ({
  default: () => <select aria-label="Language"><option>English</option></select>,
}));
vi.mock("../../components/MemberSettingsPanel", () => ({
  default: () => (
    <>
      <section><h2>Privacy</h2></section>
      <section><h2>Account</h2></section>
      <section><h2>Danger zone</h2></section>
    </>
  ),
}));

describe("SettingsPage grouped mobile layout", () => {
  it("organizes settings into native-feeling preference and notification lists", () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Feed personalization")).toBeInTheDocument();
    expect(screen.getByText("New matches control")).toBeInTheDocument();
    expect(screen.getByText("Deadline reminders control")).toBeInTheDocument();
  });
});
