import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileDetailsSummary } from "./ProfileDetailsSummary";

describe("ProfileDetailsSummary", () => {
  it("shows saved profile values as readable text without editor controls", () => {
    render(
      <ProfileDetailsSummary
        fullName="Paul Light"
        country="Nigeria"
        school="University of Lagos"
        interests={["Scholarships", "Fellowships"]}
      />,
    );

    expect(screen.getByText("Paul Light")).toBeInTheDocument();
    expect(screen.getByText("Nigeria")).toBeInTheDocument();
    expect(screen.getByText("Scholarships, Fellowships")).toBeInTheDocument();
    expect(screen.queryByText("Not added")).not.toBeInTheDocument();
    expect(screen.queryByText("CGPA")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
