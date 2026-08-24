import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { RequirementChecklist } from "../RequirementChecklist";

jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      accent: "#2563eb",
      border: "#e2e8f0",
      foreground: "#0f172a",
      muted: "#f1f5f9",
    },
    isDark: false,
  }),
}));

jest.mock("../../ui/AnimatedPressable", () => {
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

describe("RequirementChecklist", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it("shows personal progress without striking through factual requirements", async () => {
    const screen = render(
      <RequirementChecklist
        opportunityId="opp-1"
        items={["Own or manage an SME.", "Submit the official application form."]}
        progressLabel={(checked, total) => `${checked} of ${total} checked`}
      />,
    );

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.getByText("0 of 2 checked")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Own or manage an SME."));

    expect(screen.getByText("1 of 2 checked")).toBeTruthy();
    expect(screen.getByText("Own or manage an SME.")).not.toHaveStyle({
      textDecorationLine: "line-through",
    });
  });
});