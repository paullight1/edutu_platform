import { beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "../../lib/auth";
import { productApiRequest } from "../../services/productApi";
import { saveOnboardingProfile } from "../../services/profile";

vi.mock("../../lib/auth", () => ({
  authService: {
    updateUserProfile: vi.fn(),
  },
}));

vi.mock("../../services/productApi", () => ({
  productApiRequest: vi.fn(),
}));

describe("saveOnboardingProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.updateUserProfile).mockRejectedValue(
      new Error("Clerk user profile is not available."),
    );
    vi.mocked(productApiRequest).mockResolvedValue({});
  });

  it("keeps the backend profile save working when the Clerk mirror fails", async () => {
    const result = await saveOnboardingProfile("clerk-token", {
      fullName: "Ada Lovelace",
      age: 28,
      courseOfStudy: "Mathematics",
      interests: ["Technology"],
      goals: ["Win a scholarship"],
      educationLevel: "undergraduate",
      location: "Nigeria",
      experience: "intermediate",
      preferredLearning: [],
    });

    expect(productApiRequest).toHaveBeenCalledWith("/profile", "clerk-token", {
      method: "PATCH",
      body: JSON.stringify({
        fullName: "Ada Lovelace",
        courseOfStudy: "Mathematics",
        age: 28,
      }),
    });
    expect(result.completed).toBe(true);
  });
});
