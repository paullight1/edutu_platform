import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachSheet from "./CoachSheet";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options: { defaultValue: string }) =>
      options.defaultValue,
  }),
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "learner-1" }),
}));
vi.mock("./CoachPage", () => ({ default: () => <p>Conversation content</p> }));
vi.mock("../feature-access/PaidToolGate", () => ({
  PaidToolGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  useDragControls: () => ({ start: vi.fn() }),
  motion: {
    div: function Surface({
      children,
      animate,
      onAnimationComplete,
    }: {
      children: ReactNode;
      animate: { opacity: number };
      onAnimationComplete: () => void;
    }) {
      useEffect(() => {
        if (animate.opacity === 0) onAnimationComplete();
      }, [animate.opacity, onAnimationComplete]);
      return <div>{children}</div>;
    },
  },
}));
beforeEach(() => {
  navigate.mockClear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
});
describe("CoachSheet desktop controls", () => {
  it("keeps closing separate from resizing the conversation", async () => {
    render(<CoachSheet returnTo="/dashboard" />);
    expect(
      screen.getByRole("button", { name: "Close AI Coach" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand AI Coach" }));
    expect(screen.getByText("Conversation content")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Restore AI Coach size" }),
    );
    expect(
      screen.getByRole("button", { name: "Expand AI Coach" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close AI Coach" }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true }),
    );
  });
  it("returns to the originating page when the dialog is dismissed", async () => {
    render(<CoachSheet returnTo="/app/my-plan" />);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/app/my-plan", { replace: true }),
    );
  });
});
