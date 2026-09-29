import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import DashboardUpdatePopup from "./DashboardUpdatePopup";

describe("DashboardUpdatePopup", () => {
  beforeEach(() => window.localStorage.clear());

  it("announces the plan update without blocking the dashboard", () => {
    render(<MemoryRouter><DashboardUpdatePopup /></MemoryRouter>);

    expect(screen.getByRole("region", { name: "Edutu update" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open my plan/i })).toHaveAttribute("href", "/app/my-plan");
  });

  it("can be dismissed and remembers the choice", () => {
    render(<MemoryRouter><DashboardUpdatePopup /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Edutu updates" }));

    expect(screen.queryByRole("region", { name: "Edutu update" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("edutu_dashboard_update_2026_09_seen")).toBe("1");
  });
});
