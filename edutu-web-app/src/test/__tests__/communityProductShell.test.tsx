import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommunityProductShell from "../../features/community/components/CommunityProductShell";

describe("CommunityProductShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows one page title and the three-item Community bottom navigation", () => {
    render(
      <MemoryRouter initialEntries={["/app/community/explore"]}>
        <CommunityProductShell title="Explore">
          <div>Community content</div>
        </CommunityProductShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Explore" })).not.toHaveClass(
      "sr-only",
    );
    const sections = screen.getByRole("navigation", {
      name: "Community mobile navigation",
    });
    expect(sections).toBeInTheDocument();
    expect(sections).toHaveClass("dark:bg-surface-layer");
    expect(sections).not.toHaveClass("dark:bg-surface-layer/95");
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "href",
      "/app/community/explore",
    );
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute(
      "href",
      "/app/community/groups",
    );
    expect(screen.getByRole("link", { name: "Chats" })).toHaveAttribute(
      "href",
      "/app/community/chats",
    );

    const activeLink = screen.getByRole("link", { name: "Explore" });
    expect(activeLink).toHaveClass("text-[#f45b16]");
    expect(activeLink.querySelectorAll("span")).toHaveLength(1);
  });

  it("puts Edutu home on the left and the Community profile on the right of Explore", () => {
    render(
      <MemoryRouter initialEntries={["/app/community/explore"]}>
        <CommunityProductShell title="Communities">
          <div>Community content</div>
        </CommunityProductShell>
      </MemoryRouter>,
    );

    const header = screen
      .getByRole("heading", { name: "Communities" })
      .closest("header");

    expect(header).not.toBeNull();
    const headerLinks = within(header as HTMLElement).getAllByRole("link");
    expect(headerLinks).toHaveLength(2);
    expect(headerLinks[0]).toHaveAccessibleName("Go to Edutu home");
    expect(headerLinks[0]).toHaveAttribute("href", "/dashboard");
    expect(headerLinks[1]).toHaveAccessibleName("Community profile");
    expect(headerLinks[1]).toHaveAttribute("href", "/app/community/profile");
  });

  it("removes bottom navigation inside a focused conversation", () => {
    render(
      <MemoryRouter initialEntries={["/app/community/dm/conversation-1"]}>
        <CommunityProductShell title="Message Amina">
          <div>Conversation</div>
        </CommunityProductShell>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("navigation", {
        name: "Community mobile navigation",
      }),
    ).not.toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Back to chats" });
    expect(back).toHaveAttribute("href", "/app/community/chats");
    expect(back.querySelector("svg")).toHaveClass("rtl:rotate-180");
  });

  it("moves the group title into the sticky header as its profile title scrolls away", () => {
    let titleTop = 220;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function mockRect(this: HTMLElement) {
        if (this.id === "community-group-title") {
          return {
            top: titleTop,
            bottom: titleTop + 42,
          } as DOMRect;
        }
        if (this.tagName === "HEADER") {
          return { top: 0, bottom: 64 } as DOMRect;
        }
        return { top: 0, bottom: 0 } as DOMRect;
      },
    );

    render(
      <MemoryRouter
        initialEntries={["/app/community/groups/group-scholarship"]}
      >
        <CommunityProductShell
          title="Global Scholarship Circle"
          restingTitle="Community"
          titleAnchorId="community-group-title"
        >
          <h1 id="community-group-title">Global Scholarship Circle</h1>
        </CommunityProductShell>
      </MemoryRouter>,
    );

    const restingTitle = screen.getByTestId("community-resting-title");
    const stickyTitle = screen.getByTestId("community-scroll-title");
    expect(restingTitle).toHaveTextContent("Community");
    expect(restingTitle).toHaveAttribute("data-state", "visible");
    expect(stickyTitle).toHaveAttribute("data-state", "hidden");

    titleTop = 40;
    fireEvent.scroll(window);

    expect(stickyTitle).toHaveAttribute("data-state", "visible");
    expect(stickyTitle).toHaveClass("translate-y-0", "opacity-100");
    expect(restingTitle).toHaveAttribute("data-state", "hidden");
  });
});
