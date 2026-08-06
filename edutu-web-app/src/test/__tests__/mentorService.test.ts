import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMentorDashboard } from "../../services/mentor";

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
