import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockEndEveryone = jest.fn();
const mockJoin = jest.fn();
const mockCallState: any = {
  phase: "live",
  muted: true,
  participants: ["peer-1"],
  activeSpeakers: [],
  error: null,
  call: {
    id: "11111111-1111-4111-8111-111111111111",
    groupId: "22222222-2222-4222-8222-222222222222",
    title: "Weekly check-in",
    status: "live",
  },
};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    id: "22222222-2222-4222-8222-222222222222",
    callId: "11111111-1111-4111-8111-111111111111",
  }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
}));
jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ getToken: jest.fn() }),
  useUser: () => ({ user: { id: "owner-1" } }),
}));
jest.mock("@edutu/core/src/services/communities", () => ({
  fetchGroup: jest
    .fn()
    .mockResolvedValue({
      group: { ownerId: "owner-1" },
      membership: { role: "owner", status: "active" },
    }),
}));
jest.mock("@edutu/core/src/services/communityAuthz", () => ({
  resolveAdminRole: () => "owner",
}));
jest.mock("../features/community-calls/useCommunityCall", () => ({
  useCommunityCall: () => ({
    state: mockCallState,
    refresh: jest.fn(),
    join: mockJoin,
    reconnect: jest.fn(),
    setMuted: jest.fn(),
    leave: jest.fn(),
    endForEveryone: mockEndEveryone,
  }),
}));
jest.mock("../features/community-calls/nativeCall", () => ({
  getNativeAudioRoutes: jest.fn().mockResolvedValue([]),
  setNativeAudioRoute: jest.fn(),
}));
jest.mock("../features/community-calls/api", () => ({
  startCommunityCall: jest.fn(),
}));
jest.mock("../components/context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff",
      foreground: "#111",
      textSecondary: "#666",
      accent: "#44f",
    },
  }),
}));
jest.mock("../components/ui/ScreenHeader", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    ScreenHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
  };
});
jest.mock("../components/community/calls/CallPreflight", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return { CallPreflight: () => <Text>preflight</Text> };
});
jest.mock("../components/community/calls/VoiceCallRoom", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    VoiceCallRoom: ({
      canEnd,
      onEnd,
    }: {
      canEnd: boolean;
      onEnd: () => void;
    }) => (
      <Pressable
        testID="mock-room"
        accessibilityLabel={canEnd ? "admin-room" : "member-room"}
        onPress={onEnd}
      >
        <Text>live room</Text>
      </Pressable>
    ),
  };
});

// The screen import intentionally follows Jest's module mocks.
// eslint-disable-next-line import/first
import CommunityCallScreen from "../app/(app)/discussions/[id]/calls/[callId]";
describe("community call route", () => {
  it("renders the live room and gives an owner the end-for-everyone action", async () => {
    const screen = render(<CommunityCallScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText("admin-room")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("mock-room"));
    expect(mockEndEveryone).toHaveBeenCalled();
    expect(screen.getByText("Weekly check-in")).toBeTruthy();
  });
});
