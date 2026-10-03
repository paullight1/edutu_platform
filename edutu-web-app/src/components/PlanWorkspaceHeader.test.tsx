import "../i18n";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { it, expect } from "vitest";
import PlanWorkspaceHeader from "./PlanWorkspaceHeader";
import PlanPreparationTools from "./PlanPreparationTools";
it("connects preparation pages to My Plan without losing the current section", () => {
  render(
    <MemoryRouter initialEntries={["/app/documents"]}>
      <PlanWorkspaceHeader section="documents" compact />
      <PlanPreparationTools />
    </MemoryRouter>,
  );
  const nav = screen.getByRole("navigation", { name: "Plan workspace" });
  expect(within(nav).getByRole("link", { name: "My Plan" })).toHaveAttribute(
    "href",
    "/app/my-plan",
  );
  expect(within(nav).getByRole("link", { name: "Documents" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    within(nav).getByRole("link", { name: "CV & AI tools" }),
  ).toHaveAttribute("href", "/app/cv");
  const tools = screen.getByRole("region", {
    name: "Prepare your next application",
  });
  expect(
    within(tools)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual(["/app/cv", "/app/documents", "/app/goals"]);
});
