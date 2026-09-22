/* eslint-disable import/first -- mocks must exist before the screen import. */
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.setTimeout(15_000);

const mockPush = jest.fn();
const mockFetchCommunityDiscovery = jest.fn();
const mockFetchMobileControlConfig = jest.fn();
const mockRecordCampaignEvent = jest.fn().mockResolvedValue(undefined);
const mockGetToken = jest.fn().mockResolvedValue("token");

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

jest.mock("@edutu/core/src/services/communities", () => ({
  fetchCommunityDiscovery: (...args: unknown[]) => mockFetchCommunityDiscovery(...args),
}));

jest.mock("../lib/mobileControl", () => ({
  fetchMobileControlConfig: (...args: unknown[]) => mockFetchMobileControlConfig(...args),
  recordCampaignEvent: (...args: unknown[]) => mockRecordCampaignEvent(...args),
  selectCampaigns: (campaigns: Array<{ placement: string; status: string }>, placement: string) =>
    campaigns.filter((campaign) => campaign.status === "active" && (campaign.placement === placement || campaign.placement === "global")),
}));

jest.mock("../components/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#FFF9F1",
      foreground: "#4A170D",
      textSecondary: "#796F6B",
      card: "#FFFFFF",
      border: "#F7D9C3",
      accent: "#F45B16",
      success: "#059669",
      muted: "#FCEAD5",
      error: "#DC2626",
    },
    isDark: false,
    reducedMotion: true,
  }),
}));

import CommunityExploreScreen from "../app/(app)/discussions/explore";

const makeGroup = (
  id: string,
  name: string,
  description: string,
  memberCount: number,
  messageCount: number,
) => ({
  id,
  slug: id,
  name,
  description,
  opportunityId: null,
  ownerId: "owner-1",
  visibility: "public" as const,
  joinPolicy: "open" as const,
  coverEmoji: "💬",
  coverImageResourceUrl: null,
  accent: null,
  expiresAt: null,
  archivedAt: null,
  memberCount,
  messageCount,
  lastMessageAt: "2026-08-08T09:00:00.000Z",
  createdAt: "2026-08-08T09:00:00.000Z",
  updatedAt: "2026-08-08T09:00:00.000Z",
});

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
        creative: { ctaLabel: "Browse communities", ctaRoute: "/discussions" },
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
    trending: [
      {
        group: makeGroup(
          "scholarships",
          "Pan-African Scholarships",
          "Scholarship and fellowship funding across Africa.",
          4200,
          128,
        ),
        membership: {
          id: "membership-1",
          groupId: "scholarships",
          userId: "user-1",
          role: "member",
          status: "active",
          joinedAt: "2026-08-09T00:00:00.000Z",
        },
      },
      {
        group: makeGroup(
          "careers",
          "Careers in Tech",
          "Career advice, internships and jobs across Africa.",
          3100,
          96,
        ),
        membership: null,
      },
    ],
    communities: [
      {
        group: makeGroup(
          "study-smart",
          "Study Smart",
          "Study tips, application review and STEM support.",
          2800,
          74,
        ),
        membership: null,
      },
    ],
  });
});

it("keeps the web discovery collections distinct and exposes useful group state", async () => {
  const { getByText, getByTestId } = render(<CommunityExploreScreen />);

  await waitFor(
    () => expect(getByTestId("community-explore-discover")).toBeTruthy(),
    { timeout: 10_000 },
  );

  expect(getByTestId("community-explore-discover-trending-scroll")).toBeTruthy();
  expect(getByTestId("community-explore-discover-more-list")).toBeTruthy();
  expect(getByText("Pan-African Scholarships")).toBeTruthy();
  expect(getByText("Study Smart")).toBeTruthy();
  expect(getByText("4.2K members · 128 posts")).toBeTruthy();
  expect(getByText("Joined")).toBeTruthy();
});

it("filters both sections and lets the user recover from a zero-result search", async () => {
  const { getByPlaceholderText, getByText, getByTestId, queryByText } = render(
    <CommunityExploreScreen />,
  );

  await waitFor(() => expect(getByText("Careers in Tech")).toBeTruthy());

  fireEvent.press(getByTestId("community-focus-careers"));
  expect(getByText("Careers in Tech")).toBeTruthy();
  expect(queryByText("Pan-African Scholarships")).toBeNull();
  expect(queryByText("Study Smart")).toBeNull();

  fireEvent.changeText(getByPlaceholderText("Search communities"), "no matching room");
  expect(getByText("No communities match that yet")).toBeTruthy();
  fireEvent.press(getByTestId("community-explore-show-all"));

  expect(getByText("Pan-African Scholarships")).toBeTruthy();
  expect(getByText("Study Smart")).toBeTruthy();
});

it("opens campaign and group destinations from the redesigned cards", async () => {
  const { getByLabelText, getByTestId } = render(<CommunityExploreScreen />);

  await waitFor(() => expect(getByTestId("community-explore-discover-hero")).toBeTruthy());

  const hero = getByTestId("community-explore-discover-hero");
  expect(hero).toHaveProp("accessibilityHint", "Opens this community destination");

  fireEvent.press(hero);
  expect(mockPush).toHaveBeenCalledWith("/discussions");

  fireEvent.press(getByTestId("community-row-study-smart"));
  expect(mockPush).toHaveBeenCalledWith("/discussions/study-smart");

  fireEvent.press(getByLabelText("See all Trending"));
  expect(mockPush).toHaveBeenCalledWith("/discussions");
});

it("keeps the default hero actionable when no campaign is configured", async () => {
  mockFetchMobileControlConfig.mockResolvedValue({
    campaigns: [],
    featureFlags: [],
    widgetFeeds: [],
    appControl: {},
    pricing: {},
    paywall: {},
    serverTime: "2026-08-09T00:00:00.000Z",
  });
  const { getByTestId, getByText } = render(<CommunityExploreScreen />);

  await waitFor(() =>
    expect(getByText("Find your people. Move forward together.")).toBeTruthy(),
  );
  fireEvent.press(getByTestId("community-explore-discover-hero"));

  expect(mockPush).toHaveBeenCalledWith("/discussions");
});
