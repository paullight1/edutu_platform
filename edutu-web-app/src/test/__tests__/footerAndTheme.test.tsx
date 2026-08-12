import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import SiteFooter from "../../components/SiteFooter";
import PublicHeader from "../../components/PublicHeader";
import { useTheme } from "../../hooks/useTheme";
import { render } from "../test-utils";

function ThemeProbe() {
  const { isDarkMode } = useTheme();

  return (
    <output>
      {isDarkMode ? "dark" : "light"}
    </output>
  );
}

describe("site footer and theme behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-theme");
  });

  it("ignores a persisted accent theme so the site keeps its brand palette", async () => {
    window.localStorage.setItem("edutu-theme-pack", "rose");

    render(<ThemeProbe />);

    expect(await screen.findByText("light")).toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("keeps the dark mode control in the footer", () => {
    const footer = render(<SiteFooter />);

    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();

    footer.unmount();
    render(<PublicHeader />);

    expect(
      screen.queryByRole("button", { name: "Switch to dark mode" }),
    ).toBeNull();
  });

  it("uses the Edutu social destinations in the footer", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Edutu on X" })).toHaveAttribute(
      "href",
      "https://x.com/edutu_ai",
    );
    expect(
      screen.getByRole("link", { name: "Edutu on LinkedIn" }),
    ).toHaveAttribute("href", "https://www.linkedin.com/company/edutu-ai/");
    expect(
      screen.getByRole("link", { name: "Edutu on Instagram" }),
    ).toHaveAttribute("href", "https://www.instagram.com/edutu.ai/");
    expect(
      screen.getByRole("link", { name: "Edutu on YouTube" }),
    ).toHaveAttribute("href", "https://www.youtube.com/@edutu_ai");
    expect(screen.queryByRole("link", { name: /GitHub/i })).toBeNull();
  });

  it("toggles dark mode from the footer control", () => {
    render(<SiteFooter />);

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );

    expect(document.documentElement).toHaveClass("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });
});
