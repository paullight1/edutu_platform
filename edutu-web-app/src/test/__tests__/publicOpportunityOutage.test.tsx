import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicOpportunitiesArchivePage from "../../components/PublicOpportunitiesArchivePage";

const mocks = vi.hoisted(() => ({
  useOpportunities: vi.fn(),
}));

vi.mock("../../hooks/useOpportunities", () => ({
  useOpportunities: mocks.useOpportunities,
}));
vi.mock("../../components/PublicEditorialShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../components/Seo", () => ({ default: () => null }));

describe("public opportunities outage state", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    refresh.mockReset();
    mocks.useOpportunities.mockReturnValue({
      data: [],
      loading: false,
      error: "Opportunities are temporarily unavailable. Please try again.",
      refresh,
    });
  });

  it("offers a visible retry action when no opportunities load because of an error", () => {
    render(
      <MemoryRouter initialEntries={["/opportunities"]}>
        <PublicOpportunitiesArchivePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Opportunities are temporarily unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Results temporarily unavailable")).toHaveLength(2);
    expect(screen.queryByText("0 results")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
