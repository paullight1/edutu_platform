import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import GroupCard from "../../features/community/components/GroupCard";
import type { GroupWithMembership } from "../../features/community/types";

const row: GroupWithMembership = {
  group: {
    id: "group-scholarship",
    slug: "global-scholarship-circle",
    name: "Global Scholarship Circle",
    description: "Application reviews, funding leads and practical support.",
    opportunityId: null,
    ownerId: "user-owner",
    visibility: "public",
    joinPolicy: "open",
    coverEmoji: "🎓",
    coverImageResourceUrl: null,
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 1900,
    messageCount: 247,
    lastMessageAt: "2026-08-27T09:00:00.000Z",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  membership: null,
};

describe("GroupCard", () => {
  it("shows an X-style community row with a compact member count", () => {
    render(
      <MemoryRouter>
        <GroupCard row={row} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Open Global Scholarship Circle" }),
    ).toHaveAttribute("href", "/app/community/groups/group-scholarship");
    expect(screen.getByText("1.9K members")).toBeVisible();
    expect(
      screen.getByText("Application reviews, funding leads and practical support."),
    ).toBeVisible();
  });
});
