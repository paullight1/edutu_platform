import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupWithMembership } from "../../features/community/types";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  listGroups: vi.fn(),
  listMyCreationRequests: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
    userId: "user-member",
  }),
}));

vi.mock("../../features/community/api", () => ({
  CommunityApi: class {
    listGroups = mocks.listGroups;
    listMyCreationRequests = mocks.listMyCreationRequests;
  },
  isCommunityApiError: () => false,
}));

import CommunityGroupsPage from "../../features/community/CommunityGroupsPage";

const joinedGroup: GroupWithMembership = {
  group: {
    id: "group-1",
    slug: "testing",
    name: "Testing",
    description: "Testing",
    opportunityId: null,
    ownerId: "user-owner",
    visibility: "public",
    joinPolicy: "open",
    coverEmoji: "💬",
    coverImageResourceUrl: null,
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 3,
    messageCount: 1,
    lastMessageAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  membership: {
    id: "membership-1",
    groupId: "group-1",
    userId: "user-member",
    role: "member",
    status: "active",
    joinedAt: "2026-08-02T00:00:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listGroups.mockResolvedValue([joinedGroup]);
  mocks.listMyCreationRequests.mockResolvedValue({
    requests: [
      {
        id: "request-1",
        requesterId: "user-member",
        name: "Chevening Support Circle",
        description: "Application support",
        opportunityId: null,
        visibility: "public",
        joinPolicy: "open",
        coverEmoji: "💬",
        coverImageResourceUrl: null,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        approvedGroupId: null,
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
    ],
    slots: { used: 1, limit: 2 },
  });
});

describe("CommunityGroupsPage", () => {
  it("moves community creation out of the header into a bottom action bar", async () => {
    render(
      <MemoryRouter initialEntries={["/app/community/groups"]}>
        <CommunityGroupsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Open Testing" });

    expect(
      within(screen.getByRole("banner")).queryByRole("link", {
        name: "Create community",
      }),
    ).not.toBeInTheDocument();

    const actionBar = screen.getByRole("complementary", {
      name: "Create a community",
    });
    expect(
      within(actionBar).getByRole("link", { name: "Create community" }),
    ).toHaveAttribute("href", "/app/community/groups/new");
  });

  it("uses a compact navigation-matched create bar without helper copy", async () => {
    render(
      <MemoryRouter initialEntries={["/app/community/groups"]}>
        <CommunityGroupsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("link", { name: "Open Testing" });
    const actionBar = screen.getByRole("complementary", {
      name: "Create a community",
    });
    const createLink = within(actionBar).getByRole("link", {
      name: "Create community",
    });

    expect(within(actionBar).getByText("Create community")).toBeVisible();
    expect(
      within(actionBar).queryByText(
        "Bring people together around the same goal.",
      ),
    ).not.toBeInTheDocument();
    expect(actionBar.className).toContain("bg-surface-layer");
    expect(actionBar.className).not.toContain("bg-white");
    expect(createLink.className).toContain("h-[3.25rem]");
    expect(createLink.className).not.toContain("shadow-[");
  });

  it("renders joined communities without list-divider styling", async () => {
    render(
      <MemoryRouter initialEntries={["/app/community/groups"]}>
        <CommunityGroupsPage />
      </MemoryRouter>,
    );

    const list = await screen.findByRole("list", {
      name: "Joined communities",
    });
    expect(
      within(list).getByRole("link", { name: "Open Testing" }),
    ).toBeVisible();

    expect(list.className).not.toMatch(/(?:divide-y|border-y)/);
  });

  it("shows community proposals and the two-slot limit", async () => {
    render(
      <MemoryRouter initialEntries={["/app/community/groups"]}>
        <CommunityGroupsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Chevening Support Circle")).toBeVisible();
    expect(screen.getByText("Pending admin review")).toBeVisible();
    expect(screen.getByText("1 of 2 creation slots used")).toBeVisible();
  });
});
