import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommunityPostPage from "../../features/community/CommunityPostPage";
import {
  CommunityApi,
  CommunityApiError,
} from "../../features/community/api";
import type {
  CommunityMessage,
  GroupDetail,
} from "../../features/community/types";

const authState = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue("token"),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    getToken: authState.getToken,
    userId: "user-viewer",
  }),
}));

const detail: GroupDetail = {
  group: {
    id: "group-1",
    slug: "scholarship-circle",
    name: "Scholarship Circle",
    description: "Help each other apply.",
    opportunityId: null,
    ownerId: "user-owner",
    visibility: "public",
    joinPolicy: "open",
    coverEmoji: "🎓",
    coverImageResourceUrl: null,
    accent: null,
    expiresAt: null,
    archivedAt: null,
    memberCount: 12,
    messageCount: 4,
    lastMessageAt: "2026-08-28T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
  },
  membership: {
    id: "membership-1",
    groupId: "group-1",
    userId: "user-viewer",
    role: "member",
    status: "active",
    joinedAt: "2026-08-20T12:00:00.000Z",
  },
};

const post: CommunityMessage = {
  id: "post-1",
  groupId: "group-1",
  userId: "user-owner",
  body: "Here is the application checklist.",
  kind: "text",
  opportunityId: null,
  createdAt: "2026-08-28T10:00:00.000Z",
  deletedAt: null,
  deletedBy: null,
  parentMessageId: null,
  pinnedAt: null,
  pinnedBy: null,
  likeCount: 5,
  commentCount: 2,
  viewerHasLiked: false,
  author: { displayName: "Amina", avatarUrl: null },
};

const comments: CommunityMessage[] = [
  {
    ...post,
    id: "comment-1",
    userId: "user-bola",
    body: "Thank you for sharing this.",
    createdAt: "2026-08-28T10:05:00.000Z",
    parentMessageId: post.id,
    likeCount: 0,
    commentCount: 0,
    author: { displayName: "Bola", avatarUrl: null },
  },
  {
    ...post,
    id: "comment-2",
    userId: "user-viewer",
    body: "The referee section helped me.",
    createdAt: "2026-08-28T10:10:00.000Z",
    parentMessageId: post.id,
    likeCount: 0,
    commentCount: 0,
    author: { displayName: "Viewer", avatarUrl: null },
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/community/groups/group-1/posts/post-1"]}>
      <Routes>
        <Route
          path="/app/community/groups/:id/posts/:postId"
          element={<CommunityPostPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CommunityPostPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(CommunityApi.prototype, "getGroup").mockResolvedValue(detail);
    vi.spyOn(CommunityApi.prototype, "fetchPostThread").mockResolvedValue({
      post,
      comments,
    });
  });

  it("shows the selected post once with chronological comments below", async () => {
    renderPage();

    await screen.findByText(post.body);
    expect(screen.getByRole("heading", { name: "Post" })).toBeVisible();
    expect(screen.getAllByText(post.body)).toHaveLength(1);
    const list = screen.getByRole("feed", { name: "Post comments" });
    const articles = within(list).getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveTextContent(comments[0].body);
    expect(articles[1]).toHaveTextContent(comments[1].body);
  });

  it("shows an empty-comments state with a fixed comment composer", async () => {
    vi.spyOn(CommunityApi.prototype, "fetchPostThread").mockResolvedValue({
      post: { ...post, commentCount: 0 },
      comments: [],
    });
    renderPage();

    expect(await screen.findByText("No comments yet")).toBeVisible();
    const composer = screen.getByRole("form", {
      name: "Community comment composer",
    });
    expect(composer).toHaveClass("fixed", "bottom-0");
    expect(composer).toHaveAttribute("data-keyboard-avoid");
  });

  it("keeps the post header back action scoped to its community", async () => {
    renderPage();
    await screen.findByText(post.body);

    expect(
      screen
        .getAllByRole("link", { name: "Back to community" })
        .every(
          (link) =>
            link.getAttribute("href") === "/app/community/groups/group-1",
        ),
    ).toBe(true);
  });

  it("posts a comment, appends it below the post, and clears the draft", async () => {
    const created = {
      ...comments[1],
      id: "comment-new",
      body: "Adding one more tip.",
    };
    const sendComment = vi
      .spyOn(CommunityApi.prototype, "sendComment")
      .mockResolvedValue(created);
    renderPage();
    const input = await screen.findByPlaceholderText("Write a comment…");

    fireEvent.change(input, { target: { value: created.body } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Community comment composer" }),
    );

    await waitFor(() =>
      expect(sendComment).toHaveBeenCalledWith("group-1", "post-1", {
        body: created.body,
      }),
    );
    expect(await screen.findByText(created.body)).toBeVisible();
    expect(input).toHaveValue("");
  });

  it("preserves the draft when posting a comment fails", async () => {
    vi.spyOn(CommunityApi.prototype, "sendComment").mockRejectedValue(
      new Error("Comment could not be posted."),
    );
    renderPage();
    const input = await screen.findByPlaceholderText("Write a comment…");
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Community comment composer" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Comment could not be posted.",
    );
    expect(input).toHaveValue("Keep this draft");
  });

  it("links back to the group when the post is unavailable", async () => {
    vi.spyOn(CommunityApi.prototype, "fetchPostThread").mockRejectedValue(
      new CommunityApiError("That post was not found.", 404),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Post unavailable" }),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole("link", { name: "Back to community" })
        .every(
          (link) =>
            link.getAttribute("href") === "/app/community/groups/group-1",
        ),
    ).toBe(true);
  });
});
