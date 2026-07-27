import { isApprovedMentor, deriveMentorStatus } from "./mentor-access";

describe("isApprovedMentor", () => {
  it("is true when creator_status is approved", () => {
    expect(isApprovedMentor({ creatorStatus: "approved" })).toBe(true);
  });
  it("is true when mentor_status is approved", () => {
    expect(isApprovedMentor({ mentorStatus: "approved" })).toBe(true);
  });
  it("is false when neither is approved", () => {
    expect(
      isApprovedMentor({ creatorStatus: "pending", mentorStatus: "none" }),
    ).toBe(false);
  });
  it("is false for null/undefined", () => {
    expect(isApprovedMentor(null)).toBe(false);
    expect(isApprovedMentor(undefined)).toBe(false);
  });
});

describe("deriveMentorStatus", () => {
  it("returns approved when either status is approved", () => {
    expect(deriveMentorStatus({ mentorStatus: "approved" })).toBe("approved");
  });
  it("returns pending when a status is pending and none approved", () => {
    expect(deriveMentorStatus({ creatorStatus: "pending" })).toBe("pending");
  });
  it("returns rejected when a status is rejected and none pending/approved", () => {
    expect(deriveMentorStatus({ mentorStatus: "rejected" })).toBe("rejected");
  });
  it("returns none by default", () => {
    expect(deriveMentorStatus({})).toBe("none");
    expect(deriveMentorStatus(null)).toBe("none");
  });
});
