import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AdminNotFound from "./AdminNotFound";

describe("AdminNotFound", () => {
  it("explains the missing protected route and provides a dashboard recovery link", () => {
    render(
      <MemoryRouter initialEntries={["/unknown-admin-route"]}>
        <AdminNotFound />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Admin page not found" }),
    ).toBeVisible();
    expect(screen.getByText("/unknown-admin-route")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Return to dashboard" }),
    ).toHaveAttribute("href", "/");
  });
});
