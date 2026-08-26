import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BannerCarousel, type BannerAd } from "../Dashboard";

const banners: BannerAd[] = [
  {
    image: "/first.png",
    url: "/first",
    alt: "First promotion",
    eyebrow: "First",
    title: "Find your next open door",
    subtitle: "Matches for your goals.",
    cta: "Old CTA",
  },
  {
    image: "/second.png",
    url: "/second",
    alt: "Second promotion",
    eyebrow: "Second",
    title: "Track every deadline",
    subtitle: "Stay ready.",
  },
];

describe("BannerCarousel", () => {
  it("uses dots and a next arrow instead of a CTA pill", async () => {
    render(<BannerCarousel banners={banners} />);

    expect(screen.queryByText("Old CTA")).not.toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /show promotion 1/i }),
    ).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: /next promotion/i }));

    expect(
      await screen.findByRole("link", { name: /track every deadline/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /show promotion 2/i }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
