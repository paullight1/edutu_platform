import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CommunityProductShell from "../../features/community/components/CommunityProductShell";

describe("CommunityProductShell", () => {
  it("provides a dedicated mobile navigation for community work", () => {
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
      screen.getByRole("navigation", {
        name: "Community mobile navigation",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute(
      "href",
      "/app/community/explore",
    );
    expect(screen.getByRole("link", { name: "Your groups" })).toHaveAttribute(
      "href",
      "/app/community/groups",
    );
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute(
      "href",
      "/app/community/chats",
    );
  });
});
