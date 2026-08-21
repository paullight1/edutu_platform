import { describe, expect, it, vi } from "vitest";
import {
  classifyCommunityAttachmentFile,
  sendCommunityAttachment,
} from "../../features/community/attachmentWorkflow";
import {
  buildGroupSettingsSubmission,
  canManageCommunityGroup,
} from "../../features/community/settingsModel";
import type { GroupDetail } from "../../features/community/types";

function detail(
  role: "owner" | "mod" | "member" = "owner",
  status: "active" | "pending" | "removed" = "active",
): GroupDetail {
  return {
    group: {
      id: "group-1",
      slug: "group-one",
      name: "Group one",
      description: "A useful room.",
      opportunityId: "11111111-1111-4111-8111-111111111111",
      ownerId: "user_owner",
      visibility: "public",
      joinPolicy: "request",
      coverEmoji: "🎓",
      accent: null,
      expiresAt: null,
      archivedAt: null,
      memberCount: 3,
      messageCount: 8,
      lastMessageAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    membership: {
      id: "member-1",
      groupId: "group-1",
      userId: role === "owner" ? "user_owner" : "user_actor",
      role,
      status,
      joinedAt: "2026-08-01T00:00:00.000Z",
    },
  };
}

describe("community attachment workflow", () => {
  it("reserves, uploads, then persists an image attachment with a safe caption", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "essay-proof.png", {
      type: "image/png",
    });
    const createAttachmentUpload = vi.fn().mockResolvedValue({
      uploadUrl: "https://storage.edutu.test/signed",
      resourceUrl:
        "https://api.edutu.test/communities/groups/group-1/attachments/download-url?path=file&signature=signed",
      storagePath: "groups/group-1/file.png",
    });
    const sendMessage = vi.fn().mockResolvedValue({ id: "message-1" });
    const uploader = vi.fn().mockResolvedValue(undefined);

    await sendCommunityAttachment(
      { createAttachmentUpload, sendMessage } as never,
      "group-1",
      file,
      "My draft evidence",
      uploader,
    );

    expect(createAttachmentUpload).toHaveBeenCalledWith("group-1", {
      kind: "image",
      name: "essay-proof.png",
      mime: "image/png",
      size: 3,
    });
    expect(uploader).toHaveBeenCalledWith(
      "https://storage.edutu.test/signed",
      file,
    );
    const [, sent] = sendMessage.mock.calls[0] as [string, { kind: string; body: string }];
    expect(sent.kind).toBe("image");
    expect(JSON.parse(sent.body)).toEqual({
      url: "https://api.edutu.test/communities/groups/group-1/attachments/download-url?path=file&signature=signed",
      name: "essay-proof.png",
      mime: "image/png",
      size: 3,
      caption: "My draft evidence",
    });
  });

  it("accepts PDFs but rejects unsupported or oversized files before any API request", () => {
    const pdf = new File([new Uint8Array([1])], "guide.pdf", {
      type: "application/pdf",
    });
    expect(classifyCommunityAttachmentFile(pdf)).toEqual({
      kind: "file",
      mime: "application/pdf",
    });

    const executable = new File([new Uint8Array([1])], "tool.exe", {
      type: "application/octet-stream",
    });
    let error: unknown;
    try {
      classifyCommunityAttachmentFile(executable);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/JPEG, PNG, or WebP/i);
    expect((error as Error).message).toMatch(/PDF/i);
  });
});

describe("community group settings model", () => {
  it("builds only mutable group fields and a validated request form", () => {
    expect(
      buildGroupSettingsSubmission({
        name: "  Chevening 2027  ",
        description: "  Applicants preparing together.  ",
        visibility: "private",
        joinPolicy: "request",
        questions: [
          {
            id: "why",
            type: "long_text",
            label: "Why do you want to join?",
            required: true,
          },
          {
            id: "stage",
            type: "single_select",
            label: "Application stage",
            required: false,
            options: ["Researching", "Drafting"],
          },
        ],
      }),
    ).toEqual({
      patch: {
        name: "Chevening 2027",
        description: "Applicants preparing together.",
        visibility: "private",
        joinPolicy: "request",
      },
      form: {
        questions: [
          {
            id: "why",
            type: "long_text",
            label: "Why do you want to join?",
            required: true,
          },
          {
            id: "stage",
            type: "single_select",
            label: "Application stage",
            required: false,
            options: ["Researching", "Drafting"],
          },
        ],
      },
    });
  });

  it("rejects invalid names, descriptions, and screening forms", () => {
    expect(() =>
      buildGroupSettingsSubmission({
        name: "Hi",
        description: "",
        visibility: "public",
        joinPolicy: "open",
        questions: [],
      }),
    ).toThrow(/3/);

    expect(() =>
      buildGroupSettingsSubmission({
        name: "Valid name",
        description: "x".repeat(281),
        visibility: "public",
        joinPolicy: "open",
        questions: [],
      }),
    ).toThrow(/280/);

    expect(() =>
      buildGroupSettingsSubmission({
        name: "Valid name",
        description: "",
        visibility: "public",
        joinPolicy: "request",
        questions: [
          {
            id: "stage",
            type: "single_select",
            label: "Stage",
            required: true,
            options: ["Only one"],
          },
        ],
      }),
    ).toThrow(/2 options/);
  });

  it("allows only active owners/moderators to manage settings", () => {
    expect(canManageCommunityGroup(detail("owner"), "user_owner")).toBe(true);
    expect(canManageCommunityGroup(detail("mod"), "user_actor")).toBe(true);
    expect(canManageCommunityGroup(detail("member"), "user_actor")).toBe(false);
    expect(canManageCommunityGroup(detail("mod", "removed"), "user_actor")).toBe(false);
    expect(canManageCommunityGroup(detail("owner", "pending"), "user_owner")).toBe(false);
  });
});
