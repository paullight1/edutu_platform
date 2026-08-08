/* eslint-disable import/first -- mocks must exist before the screen import. */
import React from "react";
import { StyleSheet } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockFetchGroups = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue("token") }),
}));

jest.mock("@edutu/core/src/services/communities", () => ({
  fetchGroups: (...args: unknown[]) => mockFetchGroups(...args),
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
    },
  }),
}));

import CommunityExploreScreen from "../app/(app)/discussions/explore";

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchGroups.mockResolvedValue([
    {
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
    },
  ]);
});

it("keeps each discovery community in one horizontal row", async () => {
  const { getByTestId } = render(<CommunityExploreScreen />);

  await waitFor(() =>
    expect(getByTestId("community-row-group-1")).toBeTruthy(),
  );
  expect(
    StyleSheet.flatten(getByTestId("community-row-group-1").props.style)
      .flexDirection,
  ).toBe("row");
});
