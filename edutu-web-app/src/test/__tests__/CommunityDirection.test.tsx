import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { changeLanguage } from "../../i18n";
import CommunityDirectionalIcon from "../../components/CommunityDirectionalIcon";

afterEach(() => {
  changeLanguage("en");
});

describe("CommunityDirectionalIcon", () => {
  it("mirrors a back icon when the active language is right-to-left", async () => {
    changeLanguage("ar");
    render(<CommunityDirectionalIcon data-testid="community-direction-icon" />);

    const icon = screen.getByTestId("community-direction-icon");
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(icon).toHaveStyle({ transform: "rotate(180deg)" });
  });

  it("keeps the back icon unrotated in left-to-right languages", async () => {
    changeLanguage("en");
    render(<CommunityDirectionalIcon data-testid="community-direction-icon" />);

    const icon = screen.getByTestId("community-direction-icon");
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    expect(icon).toHaveStyle({ transform: "none" });
  });
});
