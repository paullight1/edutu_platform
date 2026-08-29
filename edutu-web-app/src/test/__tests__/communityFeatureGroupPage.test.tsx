import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommunityGroupPage from "../../features/community/CommunityGroupPage";
import { CommunityApi } from "../../features/community/api";
import type {
  CommunityMessage,
  GroupDetail,
} from "../../features/community/types";

const messageState = vi.hoisted(() => ({
  messages: [] as CommunityMessage[],
  loading: false,
  enabled: true,
}));
const authState = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue("token"),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: authState.getToken,
    userId: "user-viewer",
  }),
}));

vi.mock("../../features/community/useGroupMessages", () => ({
  useGroupMessages: ({ enabled }: { enabled: boolean }) => {
    messageState.enabled = enabled;
    return ({
    messages: messageState.messages,
    loading: messageState.loading,
    loadingMore: false,
    hasMore: false,
    error: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
    append: vi.fn(),
    replace: vi.fn(),
    });
  },
}));

const detail: GroupDetail = {
  group: {
    id: "group-scholarship",
    slug: "global-scholarship-circle",
    name: "Global Scholarship Circle",
    description: "Win funding together through honest application feedback.",
    opportunityId: null,
    ownerId: "user-owner",
    visibility: "public",
    joinPolicy: "request",
    coverEmoji: "🎓",
    coverImageResourceUrl: null,
    accent: "#f45b16",
    expiresAt: null,
    archivedAt: null,
    memberCount: 1900,
    messageCount: 247,
    lastMessageAt: "2026-08-27T09:00:00.000Z",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  membership: null,
};

const activeDetail: GroupDetail = {
  ...detail,
  membership: {
    id: "membership-viewer",
    groupId: detail.group.id,
    userId: "user-viewer",
    role: "member",
    status: "active",
    joinedAt: "2026-08-27T09:00:00.000Z",
  },
};

const messages: CommunityMessage[] = [
  {
    id: "message-one",
    groupId: detail.group.id,
    userId: "user-owner",
    body: "Welcome to the group.",
    kind: "text",
    opportunityId: null,
    createdAt: "2026-08-27T09:00:00.000Z",
    deletedAt: null,
    deletedBy: null,
    author: { displayName: "Amina", avatarUrl: null },
  },
  {
    id: "message-two",
    groupId: detail.group.id,
    userId: "user-viewer",
    body: "Glad to be here.",
    kind: "text",
    opportunityId: null,
    createdAt: "2026-08-27T09:05:00.000Z",
    deletedAt: null,
    deletedBy: null,
    author: { displayName: "Viewer", avatarUrl: null },
  },
];

function groupRoute() {
  return (
    <MemoryRouter initialEntries={["/app/community/groups/group-scholarship"]}>
      <Routes>
        <Route
          path="/app/community/groups/:id"
          element={<CommunityGroupPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("CommunityGroupPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    messageState.messages = [];
    messageState.loading = false;
    messageState.enabled = true;
    window.localStorage.clear();
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(detail);
    vi.spyOn(CommunityApi.prototype, "fetchPinnedPost").mockResolvedValue(null);
    vi.spyOn(CommunityApi.prototype, "getMembers").mockResolvedValue({
      members: [
        {
          membership: {
            id: "membership-owner",
            groupId: detail.group.id,
            userId: "user-owner",
            role: "owner",
            status: "active",
            joinedAt: "2026-01-10T09:00:00.000Z",
          },
          profile: { displayName: "Amina Yusuf", avatarUrl: null },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
  });

  it("uses a profile-led header and focused content tabs", async () => {
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(
      activeDetail,
    );
    render(
      <MemoryRouter
        initialEntries={["/app/community/groups/group-scholarship"]}
      >
        <Routes>
          <Route
            path="/app/community/groups/:id"
            element={<CommunityGroupPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Global Scholarship Circle" }),
    ).toBeVisible();
    expect(screen.getByText("1.9K Members")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Posts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Resources" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "About" })).toBeVisible();
  });

  it("shows only a pinned preview and join gate before membership", async () => {
    const pinned = {
      ...messages[0],
      body: "Read this before joining.",
      pinnedAt: "2026-08-28T10:00:00.000Z",
      pinnedBy: "user-owner",
      likeCount: 4,
      commentCount: 2,
      viewerHasLiked: false,
    };
    messageState.messages = [
      pinned,
      { ...messages[1], body: "Members should see this only." },
    ];
    const fetchPinnedPost = vi
      .spyOn(CommunityApi.prototype, "fetchPinnedPost")
      .mockResolvedValue(pinned);

    render(groupRoute());

    expect(await screen.findByText("Read this before joining.")).toBeVisible();
    expect(screen.queryByText("Members should see this only.")).toBeNull();
    expect(screen.getByText("Join to view more")).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Resources" })).toBeNull();
    expect(messageState.enabled).toBe(false);
    expect(fetchPinnedPost).toHaveBeenCalledWith(detail.group.id);
  });

  it("exposes the conversation as one labelled post feed", async () => {
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(
      activeDetail,
    );
    messageState.messages = messages;

    render(groupRoute());

    expect(
      await screen.findByRole("feed", { name: "Community posts" }),
    ).toBeVisible();
  });

  it("presents practical community information in the About tab", async () => {
    render(
      <MemoryRouter
        initialEntries={["/app/community/groups/group-scholarship"]}
      >
        <Routes>
          <Route
            path="/app/community/groups/:id"
            element={<CommunityGroupPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "About" }));

    expect(
      screen.getByRole("heading", { name: "Community info" }),
    ).toBeVisible();
    expect(screen.getByText("Publicly discoverable")).toBeVisible();
    expect(screen.getByText("Approval required to join")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Community standards" }),
    ).toBeVisible();
    const standards = screen.getByRole("list", {
      name: "Community standards",
    });
    expect(standards).toHaveClass("space-y-2");
    expect(standards).not.toHaveClass("divide-y");
    const members = await screen.findByRole("list", {
      name: "Community members",
    });
    expect(members).toHaveClass("space-y-1");
    expect(members).not.toHaveClass("divide-y");
  });

  it("keeps the joined-group composer on the dark surface", async () => {
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(
      activeDetail,
    );

    render(groupRoute());

    const composer = await screen.findByRole("form", {
      name: "Community message composer",
    });
    expect(composer).toHaveClass("dark:bg-surface-layer");
    expect(composer).toHaveClass("fixed", "bottom-0");
    expect(composer).toHaveAttribute("data-keyboard-avoid");
    expect(composer).not.toHaveClass("dark:bg-surface-layer/95");
  });

  it("wires the feed Like action to an optimistic API update", async () => {
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(
      activeDetail,
    );
    messageState.messages = [
      { ...messages[0], likeCount: 0, commentCount: 0, viewerHasLiked: false },
    ];
    const likeMessage = vi
      .spyOn(CommunityApi.prototype, "likeMessage")
      .mockResolvedValue({
        messageId: messages[0].id,
        likeCount: 1,
        viewerHasLiked: true,
      });

    render(groupRoute());
    fireEvent.click(await screen.findByRole("button", { name: "Like post" }));

    await waitFor(() =>
      expect(likeMessage).toHaveBeenCalledWith(messages[0].id),
    );
  });

  it("smoothly follows appended messages without jumping on initial load", async () => {
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(
      activeDetail,
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    messageState.messages = [messages[0]];

    const view = render(groupRoute());
    expect(await screen.findByText("Welcome to the group.")).toBeVisible();
    expect(scrollIntoView).not.toHaveBeenCalled();

    messageState.messages = messages;
    view.rerender(groupRoute());

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "end",
      }),
    );
  });

  it("submits the joined-group composer as a functional form", async () => {
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(
      activeDetail,
    );
    const sendMessage = vi
      .spyOn(CommunityApi.prototype, "sendMessage")
      .mockResolvedValue(messages[1]);
    window.localStorage.setItem(
      "edutu:web:community:first-post-safety:v1",
      "1",
    );

    render(groupRoute());
    const input = await screen.findByPlaceholderText("Write a useful post…");
    fireEvent.change(input, { target: { value: "Glad to be here." } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Community message composer" }),
    );

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(detail.group.id, {
        body: "Glad to be here.",
        kind: "text",
      }),
    );
  });

  it("shows the character count only after a member starts writing", async () => {
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(
      activeDetail,
    );
    window.localStorage.setItem(
      "edutu:web:community:first-post-safety:v1",
      "1",
    );

    render(groupRoute());

    const input = await screen.findByPlaceholderText("Write a useful post…");
    expect(screen.queryByText("0/2000")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Hello" } });

    const counter = screen.getByText("5 / 2,000");
    expect(counter).toBeVisible();
    expect(counter).toHaveClass("pe-2", "text-end");
    expect(counter).not.toHaveClass("pr-2", "text-right");
  });
});
