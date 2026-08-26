import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Opportunity } from "../../types/opportunity";
import DashboardOpportunityCard from "./DashboardOpportunityCard";

vi.mock("../../hooks/usePersonalization", () => ({
  usePersonalization: () => ({
    isPersonalized: false,
    explainOpportunity: vi.fn(),
  }),
}));

const opportunity = {
  id: "opportunity-1",
  title: "Women in Technology Scholarship 2027",
  category: "Scholarship",
  location: "Lagos, Nigeria",
  deadline: "2027-04-16T00:00:00.000Z",
  image: "/scholarship.png",
} as Opportunity;

describe("DashboardOpportunityCard", () => {
  it.each(["grid", "carousel", "mobileGrid"] as const)(
    "keeps essential opportunity information in the compact %s layout",
    (variant) => {
      const onOpen = vi.fn();
      const { container } = render(
        <DashboardOpportunityCard
          opportunity={opportunity}
          variant={variant}
          isBookmarked={false}
          isDarkMode={false}
          onOpen={onOpen}
          onToggleBookmark={() => undefined}
          onShare={() => undefined}
        />,
      );

      expect(container.querySelector("article")).toHaveAttribute(
        "data-density",
        "compact",
      );
      expect(
        screen.getByText("Women in Technology Scholarship 2027"),
      ).toBeInTheDocument();
      expect(screen.getByText("Scholarship")).toBeInTheDocument();
      expect(screen.getByText("Lagos, Nigeria")).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", {
          name: /open women in technology scholarship/i,
        }),
      );
      expect(onOpen).toHaveBeenCalledWith(opportunity);
    },
  );
});
