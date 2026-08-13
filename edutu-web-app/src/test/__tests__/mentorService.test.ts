import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMentorDashboard,
  submitMentorApplication,
} from "../../services/mentor";

vi.mock("../../lib/apiBaseUrl", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

describe("getMentorDashboard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls /creator/dashboard with a bearer token and returns json", async () => {
    const payload = { listings: [], totalListings: 0, stats: { publishedContent: 2 } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMentorDashboard("tok-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/creator/dashboard",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok-1" }),
      }),
    );
    expect(result.stats.publishedContent).toBe(2);
  });

  it("throws the server message on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: "Creator access not granted." }),
    }));
    await expect(getMentorDashboard("tok-1")).rejects.toThrow("Creator access not granted.");
  });
});

describe("mentor application submission", () => {
  it("submits mentor applications through the authenticated API without a public proof URL", async () => {
    const payload = {
      displayName: "Ada Okafor",
      email: "ada@example.com",
      phoneNumber: "+2348012345678",
      country: "Nigeria",
      bio: "I have guided scholarship applicants.",
      motivation: "I want to give back.",
      contentType: "mentorship",
      experience: "Three years of application coaching.",
      linkedinUrl: "https://www.linkedin.com/in/ada-okafor",
      portfolioUrl: "https://ada.example.com",
      sampleContentUrl: "https://ada.example.com",
      proofPath: "user-1/award-proof.pdf",
      proofFileName: "award-proof.pdf",
      proofFileType: "application/pdf",
      proofFileSize: 4096,
      consentAccepted: true,
    };
    const response = { id: "application-1", status: "pending", applicationKind: "mentor" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitMentorApplication("tok-1", payload);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/creator/apply",
      expect.objectContaining({ method: "POST" }),
    );
    expect(request.headers).toEqual(expect.objectContaining({ Authorization: "Bearer tok-1" }));
    expect(JSON.parse(request.body as string)).toEqual({
      ...payload,
      applicationKind: "mentor",
    });
    expect(result).toEqual(response);
  });
});
