import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Seo from "../../components/Seo";

vi.stubEnv("VITE_PUBLIC_SITE_URL", "https://www.edutu.org");

describe("Seo metadata", () => {
  it("emits the canonical homepage screenshot metadata", async () => {
    render(
      <Seo
        title="Edutu home"
        description="Find global opportunities with Edutu."
        path="/"
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://www.edutu.org/",
      );
      expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
        "content",
        "https://www.edutu.org/og/home.jpg",
      );
      expect(
        document.querySelector('meta[property="og:image:secure_url"]'),
      ).toHaveAttribute("content", "https://www.edutu.org/og/home.jpg");
      expect(document.querySelector('meta[property="og:image:type"]')).toHaveAttribute(
        "content",
        "image/jpeg",
      );
      expect(document.querySelector('meta[property="og:image:width"]')).toHaveAttribute(
        "content",
        "1200",
      );
      expect(document.querySelector('meta[property="og:image:height"]')).toHaveAttribute(
        "content",
        "630",
      );
    });
  });
});
