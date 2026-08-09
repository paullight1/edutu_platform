/* eslint-disable import/first -- mocks are declared before the screen import. */
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue("token");
const mockFetchGroup = jest.fn();
const mockFetchGroupMembers = jest.fn();
const mockFetchGroupResources = jest.fn();
const mockResolveAttachmentUrl = jest.fn();
const mockGetOpportunity = jest.fn();
let mockSearchParams: { id: string; tab?: string } = { id: "group-1" };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: mockGetToken, userId: "owner-1" }),
}));

jest.mock("../components/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#FFFFFF",
      foreground: "#111827",
      textSecondary: "#64748B",
      card: "#FFFFFF",
      border: "#E5E7EB",
      accent: "#F97316",
      muted: "#F3F4F6",
      error: "#DC2626",
    },
  }),
}));

jest.mock("@edutu/core/src/services/communities", () => {
  const actual = jest.requireActual("@edutu/core/src/services/communities");
  return {
    ...actual,
    fetchGroup: (...args: unknown[]) => mockFetchGroup(...args),
    fetchGroupMembers: (...args: unknown[]) => mockFetchGroupMembers(...args),
    fetchGroupResources: (...args: unknown[]) =>
      mockFetchGroupResources(...args),
    resolveCommunityAttachmentUrl: (...args: unknown[]) =>
      mockResolveAttachmentUrl(...args),
    setMemberRole: jest.fn(),
  };
});

jest.mock("@edutu/core/src/services/opportunities", () => ({
  getOpportunityWithStatus: (...args: unknown[]) => mockGetOpportunity(...args),
}));

import GroupAboutScreen from "../app/(app)/discussions/[id]/about";

const group = {
  id: "group-1",
  slug: "chevening-2027",
  name: "Chevening 2027 applicants",
  description: "Applicants supporting one another.",
  opportunityId: "opp-1",
  ownerId: "owner-1",
  visibility: "public",
  joinPolicy: "open",
  coverEmoji: "🎓",
  accent: null,
  expiresAt: null,
  archivedAt: null,
  memberCount: 2,
  messageCount: 8,
  lastMessageAt: "2026-08-05T10:00:00.000Z",
  createdAt: "2026-08-01T10:00:00.000Z",
};

const ownerMembership = {
  id: "member-owner",
  groupId: "group-1",
  userId: "owner-1",
  role: "owner",
  status: "active",
  joinedAt: "2026-08-01T10:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { id: "group-1" };
  mockFetchGroup.mockResolvedValue({ group, membership: ownerMembership });
  mockFetchGroupMembers.mockResolvedValue({
    hasMore: false,
    members: [
      {
        membership: ownerMembership,
        profile: {
          userId: "owner-1",
          displayName: "Amina Yusuf",
          avatarUrl: null,
        },
      },
    ],
  });
  mockGetOpportunity.mockResolvedValue({
    opportunity: {
      id: "opp-1",
      title: "Chevening Scholarship",
      organization: "Chevening",
      deadline: "2026-11-01T00:00:00.000Z",
    },
    status: "fresh",
  });
  mockFetchGroupResources.mockResolvedValue({
    resources: [],
    nextCursor: null,
  });
  mockResolveAttachmentUrl.mockResolvedValue({
    url: "https://storage.example.test/private-resource",
    expiresIn: 300,
  });
});

describe("linked opportunity on a group profile", () => {
  it("keeps resources separate from community information", async () => {
    const { getByTestId } = render(<GroupAboutScreen />);

    await waitFor(() => expect(getByTestId("group-content-tabs")).toBeTruthy());
    fireEvent.press(getByTestId("group-tab-resources"));

    expect(mockReplace).toHaveBeenCalledWith(
      "/discussions/group-1?tab=resources",
    );
  });

  it("names the creator and explains that the support group is independent", async () => {
    const { getByText } = render(<GroupAboutScreen />);

    await waitFor(() =>
      expect(getByText("Chevening Scholarship")).toBeTruthy(),
    );
    expect(
      getByText(
        "Independent peer support group created by Amina Yusuf. It is not affiliated with or endorsed by the opportunity provider.",
      ),
    ).toBeTruthy();
    expect(getByText("View and apply")).toBeTruthy();
  });

  it("requires acknowledgement before opening the linked opportunity", async () => {
    const { getByText } = render(<GroupAboutScreen />);

    await waitFor(() => expect(getByText("View and apply")).toBeTruthy());
    fireEvent.press(getByText("View and apply"));

    expect(getByText("Before you continue")).toBeTruthy();
    expect(
      getByText(
        "This is an independent peer support group created by Amina Yusuf for people interested in Chevening Scholarship. The group is not affiliated with, operated by, or endorsed by the opportunity provider.",
      ),
    ).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(getByText("Continue"));
    expect(mockPush).toHaveBeenCalledWith("/opportunities/opp-1");
  });

  it("lists persisted resources and resolves private access only when opened", async () => {
    mockSearchParams = { id: "group-1", tab: "resources" };
    mockFetchGroupResources
      .mockResolvedValueOnce({
        nextCursor: {
          before: "2026-08-05T10:00:00.000Z",
          beforeId: "resource-1",
        },
        resources: [
          {
            id: "resource-1",
            groupId: "group-1",
            kind: "file",
            attachment: {
              url: "https://api.example.test/communities/groups/group-1/attachments/download-url?path=file&signature=sig",
              name: "application-checklist.pdf",
              mime: "application/pdf",
              size: 204800,
            },
            sender: {
              userId: "owner-1",
              displayName: "Amina Yusuf",
              avatarUrl: null,
            },
            createdAt: "2026-08-05T10:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        nextCursor: null,
        resources: [
          {
            id: "resource-older",
            groupId: "group-1",
            kind: "image",
            attachment: {
              url: "https://api.example.test/private-image",
              name: "essay-example.png",
              mime: "image/png",
              size: 102400,
            },
            sender: {
              userId: "member-2",
              displayName: "Tobi Ade",
              avatarUrl: null,
            },
            createdAt: "2026-08-01T10:00:00.000Z",
          },
        ],
      });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { getByTestId, getByText } = render(<GroupAboutScreen />);

    await waitFor(() =>
      expect(getByText("application-checklist.pdf")).toBeTruthy(),
    );
    expect(mockResolveAttachmentUrl).not.toHaveBeenCalled();
    fireEvent.press(getByTestId("group-resource-resource-1"));

    await waitFor(() => expect(mockResolveAttachmentUrl).toHaveBeenCalled());
    expect(open).toHaveBeenCalledWith(
      "https://storage.example.test/private-resource",
    );

    fireEvent.press(getByTestId("group-resources-load-older"));
    await waitFor(() => expect(getByText("essay-example.png")).toBeTruthy());
    expect(mockFetchGroupResources).toHaveBeenLastCalledWith(
      "group-1",
      {
        before: "2026-08-05T10:00:00.000Z",
        beforeId: "resource-1",
        limit: 12,
      },
      mockGetToken,
    );
    open.mockRestore();
  });
});
