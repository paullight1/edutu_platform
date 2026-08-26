import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  fetchGroupForm: vi.fn(),
  saveGroupForm: vi.fn(),
  createGroupCoverImageUpload: vi.fn(),
  uploadCommunityAttachment: vi.fn(),
  updateGroup: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  useClerk: () => ({ getToken: mocks.getToken, userId: "user_owner" }),
}));

vi.mock("../../services/community", async () => {
  const actual = await vi.importActual<typeof import("../../services/community")>("../../services/community");
  return {
    ...actual,
    fetchGroupForm: mocks.fetchGroupForm,
    saveGroupForm: mocks.saveGroupForm,
    createGroupCoverImageUpload: mocks.createGroupCoverImageUpload,
    uploadCommunityAttachment: mocks.uploadCommunityAttachment,
    updateGroup: mocks.updateGroup,
  };
});

import CommunityGroupSettingsTools from "../../components/CommunityGroupSettingsTools";

const group = {
  id: "group-1",
  slug: "builders",
  name: "Scholarship Builders",
  description: "Build together",
  opportunityId: null,
  ownerId: "user_owner",
  visibility: "public" as const,
  joinPolicy: "request" as const,
  coverEmoji: "🎓",
  coverImageResourceUrl: null,
  accent: null,
  expiresAt: null,
  archivedAt: null,
  memberCount: 5,
  messageCount: 12,
  lastMessageAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

const detail = {
  group,
  membership: {
    id: "membership-owner",
    groupId: group.id,
    userId: "user_owner",
    role: "owner" as const,
    status: "active" as const,
    joinedAt: "2026-08-01T00:00:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchGroupForm.mockResolvedValue({
    questions: [
      {
        id: "q1",
        type: "short_text",
        label: "What are you applying for?",
        required: true,
      },
    ],
  });
  mocks.saveGroupForm.mockImplementation(async (_groupId, questions) => ({ questions }));
  mocks.createGroupCoverImageUpload.mockResolvedValue({
    uploadUrl: "https://storage.example/upload",
    resourceUrl: "https://api.example/communities/groups/group-1/attachments/download-url?path=cover.jpg&signature=sig",
    storagePath: "groups/group-1/cover.jpg",
  });
  mocks.uploadCommunityAttachment.mockResolvedValue(undefined);
  mocks.updateGroup.mockImplementation(async (_groupId, patch) => ({ ...group, ...patch }));
});

describe("CommunityGroupSettingsTools", () => {
  it("loads and saves screening questions against the existing group form contract", async () => {
    render(<CommunityGroupSettingsTools detail={detail} onDetailChange={vi.fn()} />);

    const question = await screen.findByDisplayValue("What are you applying for?");
    fireEvent.change(question, { target: { value: "Which programme are you applying for?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save screening questions" }));

    await waitFor(() =>
      expect(mocks.saveGroupForm).toHaveBeenCalledWith(
        group.id,
        [
          {
            id: "q1",
            type: "short_text",
            label: "Which programme are you applying for?",
            required: true,
          },
        ],
        mocks.getToken,
      ),
    );
    expect(await screen.findByText("Screening questions saved.")).toBeInTheDocument();
  });

  it("uploads a validated cover and persists only the stable resource URL", async () => {
    const onDetailChange = vi.fn();
    const { container } = render(
      <CommunityGroupSettingsTools detail={detail} onDetailChange={onDetailChange} />,
    );
    await screen.findByText("Screening questions");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "cover.png", {
      type: "image/png",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mocks.uploadCommunityAttachment).toHaveBeenCalled());
    expect(mocks.updateGroup).toHaveBeenCalledWith(
      group.id,
      {
        coverImageResourceUrl:
          "https://api.example/communities/groups/group-1/attachments/download-url?path=cover.jpg&signature=sig",
      },
      mocks.getToken,
    );
    expect(onDetailChange).toHaveBeenCalled();
  });
});
