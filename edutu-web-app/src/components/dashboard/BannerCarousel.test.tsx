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
  it("keeps the next arrow but omits pagination controls and the CTA pill", async () => {
    render(<BannerCarousel banners={banners} />);

    expect(screen.queryByText("Old CTA")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: /dashboard promotions/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next promotion/i }));

    expect(
      await screen.findByRole("link", { name: /track every deadline/i }),
    ).toBeInTheDocument();
  });
});
