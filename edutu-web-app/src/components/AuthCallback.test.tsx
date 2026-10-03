import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AuthCallback from "./AuthCallback";

const { handleRedirectCallback } = vi.hoisted(() => ({
  handleRedirectCallback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ handleRedirectCallback }),
}));
vi.mock("../lib/auth", () => ({
  consumePostAuthRedirect: () => "/app/opportunity/opp-1",
}));
vi.mock("./PublicEditorialShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

describe("Google OAuth callback", () => {
  it("welcomes signups while returning sign-ins directly to their destination", async () => {
    render(<MemoryRouter><AuthCallback /></MemoryRouter>);
    await waitFor(() => expect(handleRedirectCallback).toHaveBeenCalledWith({
      signInForceRedirectUrl: "/app/opportunity/opp-1",
      signUpForceRedirectUrl: "/dashboard?welcome=google&returnTo=%2Fapp%2Fopportunity%2Fopp-1",
    }));
  });
});
