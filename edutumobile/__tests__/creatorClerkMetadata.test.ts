import { clerkStatusMetadata } from "../lib/creator-clerk-metadata";

describe("clerkStatusMetadata", () => {
  it("syncs mentorStatus for a mentor application", () => {
    expect(clerkStatusMetadata("mentor", "approved")).toEqual({ mentorStatus: "approved" });
  });
  it("syncs creatorStatus for a creator application", () => {
    expect(clerkStatusMetadata("creator", "approved")).toEqual({ creatorStatus: "approved" });
  });
  it("defaults to creatorStatus when kind is null", () => {
    expect(clerkStatusMetadata(null, "rejected")).toEqual({ creatorStatus: "rejected" });
  });
});
