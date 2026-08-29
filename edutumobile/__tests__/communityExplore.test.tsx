/* eslint-disable import/first -- mocks must exist before the screen import. */
import React from "react";
import { StyleSheet } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockFetchCommunityDiscovery = jest.fn();
const mockFetchMobileControlConfig = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue("token") }),
}));

jest.mock("@edutu/core/src/services/communities", () => ({
  fetchCommunityDiscovery: (...args: unknown[]) => mockFetchCommunityDiscovery(...args),
}));

jest.mock("../lib/mobileControl", () => ({
  fetchMobileControlConfig: (...args: unknown[]) => mockFetchMobileControlConfig(...args),
  selectCampaigns: (campaigns: Array<{ placement: string; status: string }>, placement: string) =>
    campaigns.filter((campaign) => campaign.status === "active" && (campaign.placement === placement || campaign.placement === "global")),
}));

jest.mock("../components/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#F0F9FF",
      foreground: "#0C4A6E",
      textSecondary: "#64748B",
      card: "#FFFFFF",
      border: "#BAE6FD",
      accent: "#0284C7",
      success: "#059669",
      muted: "#E0F2FE",
      error: "#DC2626",
      isDark: false,
    },
  }),
}));

import CommunityExploreScreen from "../app/(app)/discussions/explore";

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchMobileControlConfig.mockResolvedValue({
    campaigns: [
      {
        id: "community-ad-1",
        key: "community-ad-1",
        title: "Find your people",
        body: "Join a community that keeps your goals moving.",
        campaign_type: "banner",
        placement: "community",
        status: "active",
        priority: 10,
        creative: { ctaLabel: "Explore now", ctaRoute: "/discussions" },
      },
    ],
    featureFlags: [],
    widgetFeeds: [],
    appControl: {},
    pricing: {},
    paywall: {},
    serverTime: "2026-08-09T00:00:00.000Z",
  });
  mockFetchCommunityDiscovery.mockResolvedValue({
    trending: [{
      group: {
        id: "group-1",
        name: "Testing",
        description: "Testing",
        visibility: "public",
        coverEmoji: "💬",
        coverImageResourceUrl: null,
        archivedAt: null,
        memberCount: 1,
        messageCount: 0,
        createdAt: "2026-08-08T09:00:00.000Z",
      },
      membership: null,
    }],
    communities: [],
  });
});

it("renders discovery communities as visual focus cards", async () => {
  const { getByTestId } = render(<CommunityExploreScreen />);

  await waitFor(() => expect(getByTestId("community-explore-discover-grid")).toBeTruthy());
  expect(
    StyleSheet.flatten(getByTestId("community-explore-discover-grid").props.style)
      .flexDirection,
  ).toBe("row");
});

it("renders the redesigned search surface and an admin-linked community hero", async () => {
  const { getByText, getByPlaceholderText, getByTestId } = render(<CommunityExploreScreen />);

  await waitFor(() => expect(getByTestId("community-explore-discover")).toBeTruthy());

  expect(getByPlaceholderText("Search communities")).toBeTruthy();
  expect(getByText("Find your people")).toBeTruthy();
  expect(getByText("Browse by focus")).toBeTruthy();
});
