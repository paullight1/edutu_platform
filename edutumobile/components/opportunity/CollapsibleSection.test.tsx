import React from "react";
import { Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { CollapsibleSection } from "./CollapsibleSection";

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: { border: "#e2e8f0", foreground: "#0f172a", accent: "#2563eb" },
    isDark: false,
    reducedMotion: true,
  }),
}));

jest.mock("../ui/AnimatedPressable", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  return {
    AnimatedPressable: ({
      children,
      scaleTo: _scaleTo,
      hapticFeedback: _hapticFeedback,
      ...props
    }: any) => React.createElement(Pressable, props, children),
  };
});

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: {
      View: ({ entering: _entering, ...props }: any) =>
        React.createElement(View, props),
    },
    FadeIn: { duration: () => undefined },
  };
});

describe("CollapsibleSection progressive disclosure", () => {
  it("shows a compact body first and reveals the full copy on demand", () => {
    const screen = render(
      <CollapsibleSection
        title="About this opportunity"
        defaultExpanded
        progressiveDisclosure
        collapsedBodyHeight={220}
        viewMoreLabel="View more"
        showLessLabel="Show less"
      >
        <Text>{"Detailed opportunity copy ".repeat(40)}</Text>
      </CollapsibleSection>,
    );

    expect(screen.getByTestId("collapsible-content-clip")).toHaveStyle({
      maxHeight: 220,
      overflow: "hidden",
    });
    expect(screen.getByText("View more")).toBeTruthy();

    fireEvent.press(screen.getByTestId("collapsible-view-more"));

    expect(screen.getByText("Show less")).toBeTruthy();
    expect(screen.getByTestId("collapsible-content-clip")).not.toHaveStyle({
      maxHeight: 220,
    });
  });
});
