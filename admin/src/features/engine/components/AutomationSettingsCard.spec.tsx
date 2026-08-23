import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiError";
import AutomationSettingsCard from "./AutomationSettingsCard";

const api = vi.hoisted(() => ({
  getAutomationSettings: vi.fn(),
  updateAutomationSettings: vi.fn(),
  purgeOpportunities: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

describe("AutomationSettingsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAutomationSettings.mockResolvedValue({
      auto_run_enabled: false,
      cron_schedule: "0 0 * * *",
      data_retention_days: null,
      recheck_after_days: 3,
    });
    api.updateAutomationSettings.mockResolvedValue({ success: true });
    api.purgeOpportunities.mockResolvedValue({ success: true, deletedCount: 12 });
  });

  it("loads and saves automation settings without inventing defaults", async () => {
    const user = userEvent.setup();
    render(<AutomationSettingsCard />);

    const region = await screen.findByRole("region", {
      name: "Engine automation settings",
    });
    const automatic = within(region).getByLabelText("Automatic runs");
    expect(automatic).not.toBeChecked();
    expect(within(region).getByLabelText("Cron schedule")).toHaveValue(
      "0 0 * * *",
    );
    expect(within(region).getByLabelText("Recheck window in days")).toHaveValue(3);
    expect(within(region).getByLabelText("Retention policy")).toHaveValue("off");

    await user.click(automatic);
    await user.clear(within(region).getByLabelText("Cron schedule"));
    await user.type(
      within(region).getByLabelText("Cron schedule"),
      "0 6 * * *",
    );
    await user.clear(within(region).getByLabelText("Recheck window in days"));
    await user.type(within(region).getByLabelText("Recheck window in days"), "7");
    await user.selectOptions(
      within(region).getByLabelText("Retention policy"),
      "30",
    );
    await user.click(within(region).getByRole("button", { name: "Save automation" }));

    await waitFor(() =>
      expect(api.updateAutomationSettings).toHaveBeenCalledWith({
        auto_run_enabled: true,
        cron_schedule: "0 6 * * *",
        data_retention_days: 30,
        recheck_after_days: 7,
      }),
    );
    expect(within(region).getByText("Automation settings saved")).toBeVisible();
  });

  it("purges old opportunities only after explicit confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AutomationSettingsCard />);

    const region = await screen.findByRole("region", {
      name: "Engine automation settings",
    });
    await user.selectOptions(
      within(region).getByLabelText("Retention policy"),
      "30",
    );
    await user.click(within(region).getByRole("button", { name: "Purge now" }));

    await waitFor(() => expect(api.purgeOpportunities).toHaveBeenCalledWith(30));
    expect(within(region).getByText("Purged 12 old opportunities")).toBeVisible();
  });

  it("disables purge when retention is off", async () => {
    render(<AutomationSettingsCard />);

    const region = await screen.findByRole("region", {
      name: "Engine automation settings",
    });
    expect(within(region).getByRole("button", { name: "Purge now" })).toBeDisabled();
  });

  it("surfaces load failures with the request reference instead of default settings", async () => {
    api.getAutomationSettings.mockRejectedValue(
      new AdminApiError({
        message: "Settings unavailable. Reference settings-503.",
        category: "http",
        status: 503,
        requestId: "settings-503",
        targetOrigin: "https://edutu-api.onrender.com",
        elapsedMs: 25,
      }),
    );
    render(<AutomationSettingsCard />);

    expect(await screen.findByText("Automation settings unavailable")).toBeVisible();
    expect(screen.getByText("settings-503")).toBeVisible();
    expect(screen.queryByLabelText("Cron schedule")).not.toBeInTheDocument();
  });
});
