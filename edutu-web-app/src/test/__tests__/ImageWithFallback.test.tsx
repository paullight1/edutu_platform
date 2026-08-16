import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ImageWithFallback from "../../components/ImageWithFallback";

describe("ImageWithFallback", () => {
  it("tries the supplied fallback image when the primary image fails", () => {
    render(
      <ImageWithFallback
        src="https://source.example.test/broken.jpg"
        fallbackSrc="https://cdn.example.test/share-card.png"
        alt="Opportunity cover"
      />,
    );

    const image = screen.getByRole("img", { name: "Opportunity cover" });
    fireEvent.error(image);

    expect(screen.getByRole("img", { name: "Opportunity cover" })).toHaveAttribute(
      "src",
      "https://cdn.example.test/share-card.png",
    );
  });
});
