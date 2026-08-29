import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../features/community/CommunityExplorePage", () => ({
  default: () => <div>Explore page</div>,
}));
vi.mock("../../features/community/CommunityGroupsPage", () => ({
  default: () => <div>Groups page</div>,
}));
vi.mock("../../features/community/CommunityCreateGroupPage", () => ({
  default: () => <div>Create group page</div>,
}));
vi.mock("../../features/community/CommunityGroupPage", () => ({
  default: () => <div>Group page</div>,
}));
vi.mock("../../features/community/CommunityPostPage", () => ({
  default: () => <div>Post page</div>,
}));
vi.mock("../../features/community/CommunityGroupSettingsRoute", () => ({
  default: () => <div>Group settings page</div>,
}));
vi.mock("../../features/community/CommunityJoinRequestsPage", () => ({
  default: () => <div>Join requests page</div>,
}));
vi.mock("../../features/community/CommunityChatsPage", () => ({
  default: () => <div>Chats page</div>,
}));
vi.mock("../../features/community/CommunityDmPage", () => ({
  default: () => <div>DM page</div>,
}));
vi.mock("../../features/community/CommunityNewDmPage", () => ({
  default: () => <div>New DM page</div>,
}));
vi.mock("../../features/community/CommunityProfilePage", () => ({
  default: () => <div>Profile page</div>,
}));
vi.mock("../../features/community/components/CommunityGroupToolsDock", () => ({
  default: () => null,
}));

import CommunityAppRouter from "../../features/community/CommunityAppRouter";

function CurrentLocation() {
  const { pathname, search } = useLocation();
  return <output aria-label="Current location">{pathname + search}</output>;
}

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/community/*" element={<CommunityAppRouter />} />
      </Routes>
      <CurrentLocation />
    </MemoryRouter>,
  );
}

function enterCommunity() {
  fireEvent.click(screen.getByRole("button", { name: /enter community/i }));
}

describe("CommunityAppRouter entry gate", () => {
  it("asks members to acknowledge the community standard before entering", () => {
    renderRoute("/app/community/explore");

    expect(
      screen.getByRole("heading", { name: /before you enter/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /be respectful, follow the rules, and share information that helps others/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /edutu mascot/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Explore page")).not.toBeInTheDocument();

    enterCommunity();

    expect(screen.getByText("Explore page")).toBeInTheDocument();
  });

  it("lets members go back instead of entering", async () => {
    render(
      <MemoryRouter
        initialEntries={["/dashboard", "/app/community/explore"]}
        initialIndex={1}
      >
        <Routes>
          <Route path="/app/community/*" element={<CommunityAppRouter />} />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });
});

describe("CommunityAppRouter legacy message links", () => {
  it("redirects the legacy messages inbox to Chats", async () => {
    renderRoute("/app/community/messages");
    enterCommunity();

    await waitFor(() => {
      expect(screen.getByLabelText("Current location")).toHaveTextContent(
        "/app/community/chats",
      );
    });
  });

  it("preserves a legacy conversation id when opening a DM", async () => {
    renderRoute("/app/community/messages/conversation-1?from=notification");
    enterCommunity();

    await waitFor(() => {
      expect(screen.getByLabelText("Current location")).toHaveTextContent(
        "/app/community/dm/conversation-1?from=notification",
      );
    });
  });

  it("translates the legacy user query into the new-message route", async () => {
    renderRoute("/app/community/messages?user=user_amina&name=Amina");
    enterCommunity();

    await waitFor(() => {
      expect(screen.getByLabelText("Current location")).toHaveTextContent(
        "/app/community/dm/new?name=Amina&userId=user_amina",
      );
    });
  });
});

describe("CommunityAppRouter post links", () => {
  it("keeps a shared post URL inside its group instead of redirecting to Explore", async () => {
    renderRoute("/app/community/groups/group-1/posts/post-1");
    enterCommunity();

    await waitFor(() => {
      expect(screen.getByLabelText("Current location")).toHaveTextContent(
        "/app/community/groups/group-1/posts/post-1",
      );
    });
  });
});
