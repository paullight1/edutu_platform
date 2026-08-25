import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CommunityProductShell from "../../features/community/components/CommunityProductShell";

describe("CommunityProductShell", () => {
  it("keeps section tabs accessible without mounting a second fixed mobile nav", () => {
    render(
      <MemoryRouter initialEntries={["/app/community/explore"]}>
        <CommunityProductShell title="Explore">
          <div>Community content</div>
        </CommunityProductShell>
      </MemoryRouter>,
    );

    const sections = screen.getByRole("navigation", {
      name: "Community sections",
    });
    expect(sections).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Explore/i }).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("navigation", {
        name: "Community mobile navigation",
      }),
    ).not.toBeInTheDocument();
  });
});
