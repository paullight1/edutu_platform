import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import "../../i18n";
import PlanWorkspaceHeader from "../../components/PlanWorkspaceHeader";

describe("PlanWorkspaceHeader", () => {
  it("supports a compact mobile header without removing workspace navigation", () => {
    render(
      <MemoryRouter initialEntries={["/app/deadlines"]}>
        <PlanWorkspaceHeader section="deadlines" hideIntroOnMobile />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Plan workspace" })).toBeInTheDocument();
    expect(screen.getByText("Intentional workspace")).toHaveClass("hidden", "sm:inline-flex");
  });
});
