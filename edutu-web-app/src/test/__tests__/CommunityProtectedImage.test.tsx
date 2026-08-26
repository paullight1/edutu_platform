import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-token"),
  resolveCommunityAttachmentUrl: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  useClerk: () => ({ getToken: mocks.getToken, userId: "user_me" }),
}));

vi.mock("../../services/community", async () => {
  const actual = await vi.importActual<typeof import("../../services/community")>("../../services/community");
  return {
    ...actual,
    resolveCommunityAttachmentUrl: mocks.resolveCommunityAttachmentUrl,
  };
});

import CommunityProtectedImage, {
  CommunityProtectedImageHydrator,
} from "../../components/CommunityProtectedImage";

describe("CommunityProtectedImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCommunityAttachmentUrl.mockResolvedValue({
      url: "https://storage.example/signed-cover.png",
      expiresIn: 300,
    });
  });

  it("exchanges the stable API resource for an authenticated short-lived image URL", async () => {
    const resourceUrl =
      "https://api.example/communities/groups/group-1/attachments/download-url?path=cover.png&signature=sig";

    render(
      <CommunityProtectedImage
        resourceUrl={resourceUrl}
        alt="Scholarship Builders cover"
      />,
    );

    await waitFor(() =>
      expect(mocks.resolveCommunityAttachmentUrl).toHaveBeenCalledWith(
        resourceUrl,
        mocks.getToken,
      ),
    );
    const image = await screen.findByRole("img", {
      name: "Scholarship Builders cover",
    });
    expect(image).toHaveAttribute(
      "src",
      "https://storage.example/signed-cover.png",
    );
  });

  it("fails closed without exposing the stable private resource URL as an image src", async () => {
    const resourceUrl =
      "https://api.example/communities/groups/group-2/attachments/download-url?path=private.png&signature=sig";
    mocks.resolveCommunityAttachmentUrl.mockRejectedValue(new Error("Forbidden"));

    const { container } = render(
      <CommunityProtectedImage resourceUrl={resourceUrl} alt="Private cover" />,
    );

    await waitFor(() =>
      expect(mocks.resolveCommunityAttachmentUrl).toHaveBeenCalled(),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain(resourceUrl);
  });

  it("hydrates existing Community img tags without changing their component contract", async () => {
    const resourceUrl =
      "https://api.example/communities/groups/group-3/attachments/download-url?path=card.png&signature=sig";

    render(
      <>
        <CommunityProtectedImageHydrator />
        <img src={resourceUrl} alt="Community card cover" />
      </>,
    );

    const image = screen.getByRole("img", { name: "Community card cover" });
    await waitFor(() =>
      expect(image).toHaveAttribute(
        "src",
        "https://storage.example/signed-cover.png",
      ),
    );
    expect(mocks.resolveCommunityAttachmentUrl).toHaveBeenCalledWith(
      resourceUrl,
      mocks.getToken,
    );
    expect((image as HTMLImageElement).referrerPolicy).toBe("no-referrer");
  });
});
