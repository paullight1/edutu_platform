import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), "src/features/community", relativePath), "utf8");
}

describe("Community RTL direction utilities", () => {
  it("anchors inbox badges and search affordances to logical inline edges", () => {
    const chats = source("CommunityChatsPage.tsx");
    const explore = source("CommunityExplorePage.tsx");
    const create = source("CommunityCreateGroupPage.tsx");

    expect(chats).toContain("absolute -end-0.5 -top-0.5");
    expect(chats).not.toContain("absolute -right-0.5 -top-0.5");

    expect(explore).toContain("absolute start-4 top-1/2");
    expect(explore).toContain("ps-12 pe-4");
    expect(explore).not.toContain("absolute left-4 top-1/2");
    expect(explore).not.toContain("pl-12 pr-4");

    expect(create).toContain("absolute start-3.5 top-1/2");
    expect(create).toContain("ps-10");
    expect(create).toContain("text-start");
    expect(create).toContain("ps-7");
    expect(create).not.toContain("absolute left-3.5 top-1/2");
    expect(create).not.toContain("pl-10");
    expect(create).not.toContain("text-left");
    expect(create).not.toContain("pl-7");
  });

  it("uses logical text alignment in group content and settings", () => {
    const group = source("CommunityGroupPage.tsx");
    const settings = source("CommunityGroupSettingsPage.tsx");

    expect(group).toContain("p-3 text-start shadow-sm");
    expect(group).toContain("mt-1.5 text-end text-[11px]");
    expect(group).not.toContain("p-3 text-left shadow-sm");
    expect(group).not.toContain("mt-1.5 text-right text-[11px]");

    expect(settings).toContain('ChevronLeft size={16} className="rtl:rotate-180"');
    expect(settings).toContain("rounded-2xl border p-3 text-start");
    expect(settings).not.toContain("rounded-2xl border p-3 text-left");
  });

  it("mirrors directional Community navigation arrows", () => {
    const settings = source("CommunityGroupSettingsPage.tsx");
    const requests = source("CommunityJoinRequestsPage.tsx");
    const newDm = source("CommunityNewDmPage.tsx");
    const publicGroup = source("PublicCommunityGroupPage.tsx");

    expect(settings).toContain('ChevronLeft size={16} className="rtl:rotate-180"');
    expect(requests).toContain('ArrowLeft size={18} className="rtl:rotate-180"');
    expect(newDm).toContain('ArrowLeft size={18} className="rtl:rotate-180"');
    expect(publicGroup).toContain('ArrowLeft size={16} className="rtl:rotate-180"');
    expect(publicGroup).toContain('ArrowRight size={17} className="rtl:rotate-180"');
  });

  it("mirrors the public Community CTA arrows and message preview", () => {
    const landing = source("CommunityLandingPage.tsx");

    expect(landing.match(/ArrowRight size=\{1[67]\} className="rtl:rotate-180"/g)?.length).toBe(3);
    expect(landing).toContain("rounded-2xl rounded-ss-md bg-white/10");
    expect(landing).toContain("ms-auto max-w-[82%] rounded-2xl rounded-se-md");
    expect(landing).not.toContain("rounded-tl-md");
    expect(landing).not.toContain("ml-auto max-w-[82%]");
    expect(landing).not.toContain("rounded-tr-md");
  });
});
