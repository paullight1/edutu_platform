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
    expect(screen.getByText("My Plan workspace").parentElement?.parentElement).toHaveClass(
      "hidden",
      "sm:flex",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveClass("text-brand");
    expect(screen.getByRole("link", { name: "My Plan" })).toHaveClass("text-text-secondary");
  });
});
