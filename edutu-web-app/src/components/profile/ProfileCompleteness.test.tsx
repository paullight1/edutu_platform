import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileCompleteness } from "./ProfileCompleteness";

describe("ProfileCompleteness", () => {
  it("hides the progress indicator when the profile is complete", () => {
    const { container } = render(
      <ProfileCompleteness percent={100} updatedAt="Sep 22, 2026" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Updated Sep 22, 2026")).not.toBeInTheDocument();
  });

  it("shows the progress indicator while profile details are missing", () => {
    render(<ProfileCompleteness percent={72} updatedAt="Sep 22, 2026" />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "72");
    expect(screen.getByText("Updated Sep 22, 2026")).toBeInTheDocument();
  });
});
