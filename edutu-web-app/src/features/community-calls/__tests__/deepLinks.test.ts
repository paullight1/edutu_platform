import { describe, expect, it } from "vitest";
import {
  isCommunityCallPath,
  parseEdutuDeepLink,
  safeInternalAppPath,
} from "../deepLinks";
import { CALL_ID } from "./fixtures";

describe("community call deep links", () => {
  it("accepts the canonical UUID call route", () => {
    expect(isCommunityCallPath(`/communities/calls/${CALL_ID}`)).toBe(true);
    expect(isCommunityCallPath("/communities/calls/not-an-id")).toBe(false);
  });

  it("normalizes the native custom-scheme call route", () => {
    expect(
      parseEdutuDeepLink(`ai.edutu.app://communities/calls/${CALL_ID}`),
    ).toBe(`/communities/calls/${CALL_ID}`);
  });

  it("rejects external and protocol-relative notification targets", () => {
    expect(safeInternalAppPath("//attacker.example/call", "")).toBe("");
    expect(
      parseEdutuDeepLink(
        "https://attacker.example/communities/calls/" + CALL_ID,
      ),
    ).toBeNull();
  });
});
