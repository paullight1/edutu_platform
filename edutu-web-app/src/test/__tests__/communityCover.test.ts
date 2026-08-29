import { describe, expect, it } from "vitest";
import { getCommunityFallbackCover } from "../../features/community/communityCover";

describe("community cover fallbacks", () => {
  it.each([
    ["Chevening fellowship leaders", "/community/fellowships.jpg"],
    ["Global scholarship applications", "/community/scholarships.jpg"],
    ["Graduate internship search", "/community/internships.jpg"],
    ["Essay review circle", "/community/study-support.jpg"],
  ])("maps %s to an editorial cover", (name, expected) => {
    expect(getCommunityFallbackCover(name)).toBe(expected);
  });
});
