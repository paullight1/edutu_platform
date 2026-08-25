import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiError";
import type { AutomationSettings as AutomationSettingsModel } from "../model/types";
import AutomationSettings from "./AutomationSettings";
import RetentionSettings from "./RetentionSettings";

const settings: AutomationSettingsModel = {
  auto_run_enabled: false,
  cron_schedule: "0 0 * * *",
  data_retention_days: 90,
  recheck_after_days: 3,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("AutomationSettings", () => {
  it("does not announce success until the API save resolves", async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const onSave = vi.fn(() => pending.promise);
    const onNotice = vi.fn();

    render(
      <AutomationSettings
        settings={settings}
        pending={false}
        error={null}
        onSave={onSave}
        onNotice={onNotice}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Enable automatic runs" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save automation settings" }),
    );

    expect(onSave).toHaveBeenCalledWith({
      ...settings,
      auto_run_enabled: true,
    });
    expect(onNotice).not.toHaveBeenCalled();

    pending.resolve();
    await screen.findByText("Automation settings saved.");
    expect(onNotice).toHaveBeenCalledWith(
      "Automation settings saved.",
      "success",
    );
  });

  it("restores confirmed settings and shows the request reference after a failed save", async () => {
    const user = userEvent.setup();
    const failure = new AdminApiError({
      message: "Update failed. Reference req-auto-7.",
      category: "http",
      status: 503,
      requestId: "req-auto-7",
      targetOrigin: "https://api.example.org",
      elapsedMs: 20,
    });
    const onSave = vi.fn().mockRejectedValue(failure);

    render(
      <AutomationSettings
        settings={settings}
        pending={false}
        error={null}
        onSave={onSave}
        onNotice={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Enable automatic runs",
    });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(
      screen.getByRole("button", { name: "Save automation settings" }),
    );

    expect(await screen.findByText(/req-auto-7/u)).toBeVisible();
    expect(checkbox).not.toBeChecked();
  });
});

describe("RetentionSettings", () => {
  it("requires confirmation before purging opportunities", async () => {
    const user = userEvent.setup();
    const onPurge = vi.fn().mockResolvedValue({ deletedCount: 4 });
    const onNotice = vi.fn();

    render(
      <RetentionSettings
        settings={settings}
        pending={false}
        error={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onPurge={onPurge}
        onNotice={onNotice}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Purge expired opportunities" }),
    );
    expect(onPurge).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText("Purge expired opportunities?"),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Purge data" }));

    expect(onPurge).toHaveBeenCalledWith(90);
    expect(onNotice).toHaveBeenCalledWith(
      "Purged 4 expired opportunities.",
      "success",
    );
  });
});
