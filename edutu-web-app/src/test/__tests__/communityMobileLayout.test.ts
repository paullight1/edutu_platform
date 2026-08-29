import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function communitySource(name: string): string {
  return readFileSync(
    resolve(process.cwd(), "src/features/community", name),
    "utf8",
  );
}

describe("authenticated community mobile layout", () => {
  it("uses text segments and flat group rows on mobile", () => {
    const explore = communitySource("CommunityExplorePage.tsx");
    const card = communitySource("components/GroupCard.tsx");
    const groups = communitySource("CommunityGroupsPage.tsx");

    expect(explore).toContain('role="tablist"');
    expect(explore).toContain('aria-label="Community focus"');
    expect(card).toContain("sm:rounded-[22px]");
    expect(groups).toContain("{title} {rows.length}");
    expect(explore).toContain("Trending");
    expect(explore).toContain("More communities");
    expect(explore).not.toContain("Discover communities");
    expect(explore).not.toContain("Refresh communities");
    expect(explore).not.toContain("{visible.length}");
  });

  it("gives Community its own shell instead of the universal mobile chrome", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/AppWorkspaceShell.tsx"),
      "utf8",
    );
    const productShell = communitySource(
      "components/CommunityProductShell.tsx",
    );

    expect(shell).toContain("!isCommunityRoute");
    expect(productShell).toContain('aria-label="Community mobile navigation"');
    expect(productShell).toContain("Compass");
    expect(productShell).toContain("UsersRound");
    expect(productShell).toContain("MessageCircle");
  });

  it("keeps the joined-group composer on the bottom edge and simplifies first-post safety", () => {
    const group = communitySource("CommunityGroupPage.tsx");
    const composer = communitySource("components/CommunityComposer.tsx");

    expect(group).toContain("<CommunityComposer");
    expect(composer).toContain('className="fixed inset-x-0 bottom-0');
    expect(composer).not.toContain(
      "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]",
    );
    expect(composer).toContain("Post safely");
    expect(composer).toContain("Got it");
    expect(composer).not.toContain("Before your first community post");
    expect(group).toContain('? "Resources"');
    expect(group).not.toContain('item === "resources" ? "Media"');
  });
});
