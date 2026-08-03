import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebPushSettings from "../../components/WebPushSettings";
import WebPushPrompt from "../../components/WebPushPrompt";
import { dismissWebPushPrompt } from "../../lib/webPushPrompt";
import type { WebPushState } from "../../lib/webPush";

const webPush = vi.hoisted(() => ({
  state: "prompt" as WebPushState,
  getWebPushState: vi.fn(),
  subscribeToWebPush: vi.fn(),
  unsubscribeFromWebPush: vi.fn(),
}));

const clerk = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue("token-1"),
}));

vi.mock("../../lib/webPush", () => ({
  getWebPushState: webPush.getWebPushState,
  subscribeToWebPush: webPush.subscribeToWebPush,
  unsubscribeFromWebPush: webPush.unsubscribeFromWebPush,
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: clerk.getToken }),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

function setState(next: WebPushState) {
  webPush.state = next;
  webPush.getWebPushState.mockImplementation(() =>
    Promise.resolve(webPush.state),
  );
}

describe("web push surfaces", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    setState("prompt");
    webPush.subscribeToWebPush.mockImplementation(() => {
      webPush.state = "subscribed";
      return Promise.resolve<WebPushState>("subscribed");
    });
    webPush.unsubscribeFromWebPush.mockImplementation(() => {
      webPush.state = "prompt";
      return Promise.resolve();
    });
  });

  describe("WebPushSettings", () => {
    it.each<WebPushState>(["denied", "unsupported", "unconfigured"])(
      "renders nothing when state is %s",
      async (state) => {
        setState(state);
        const { container } = render(<WebPushSettings />);

        await waitFor(() => {
          expect(webPush.getWebPushState).toHaveBeenCalled();
        });
        expect(container).toBeEmptyDOMElement();
      },
    );

    it("subscribes when toggled on", async () => {
      render(<WebPushSettings />);

      const toggle = await screen.findByRole("switch");
      expect(toggle).toHaveAttribute("aria-checked", "false");

      fireEvent.click(toggle);

      await waitFor(() => {
        expect(webPush.subscribeToWebPush).toHaveBeenCalledWith(
          "user-1",
          "token-1",
        );
      });
      await waitFor(() => {
        expect(screen.getByRole("switch")).toHaveAttribute(
          "aria-checked",
          "true",
        );
      });
    });

    it("unsubscribes when toggled off", async () => {
      setState("subscribed");
      render(<WebPushSettings />);

      const toggle = await screen.findByRole("switch");
      expect(toggle).toHaveAttribute("aria-checked", "true");

      fireEvent.click(toggle);

      await waitFor(() => {
        expect(webPush.unsubscribeFromWebPush).toHaveBeenCalledWith(
          "user-1",
          "token-1",
        );
      });
      await waitFor(() => {
        expect(screen.getByRole("switch")).toHaveAttribute(
          "aria-checked",
          "false",
        );
      });
      expect(webPush.subscribeToWebPush).not.toHaveBeenCalled();
    });
  });

  describe("WebPushPrompt", () => {
    const props = {
      promptId: "saved",
      title: "Never miss a saved deadline",
      body: "We will nudge you.",
    };

    it("renders a call to action in the prompt state", async () => {
      render(<WebPushPrompt {...props} />);

      expect(
        await screen.findByRole("button", { name: /turn on reminders/i }),
      ).toBeInTheDocument();
    });

    it.each<WebPushState>(["denied", "unsupported", "unconfigured", "subscribed"])(
      "renders nothing when state is %s",
      async (state) => {
        setState(state);
        const { container } = render(<WebPushPrompt {...props} />);

        await waitFor(() => {
          expect(webPush.getWebPushState).toHaveBeenCalled();
        });
        expect(container).toBeEmptyDOMElement();
      },
    );

    it("subscribes from the click handler, never from an effect", async () => {
      render(<WebPushPrompt {...props} />);

      const cta = await screen.findByRole("button", {
        name: /turn on reminders/i,
      });
      expect(webPush.subscribeToWebPush).not.toHaveBeenCalled();

      fireEvent.click(cta);

      await waitFor(() => {
        expect(webPush.subscribeToWebPush).toHaveBeenCalledWith(
          "user-1",
          "token-1",
        );
      });
    });

    it("stays hidden once dismissed", async () => {
      const { container, unmount } = render(<WebPushPrompt {...props} />);

      fireEvent.click(
        await screen.findByRole("button", { name: /dismiss reminder prompt/i }),
      );
      expect(container).toBeEmptyDOMElement();
      unmount();

      const remounted = render(<WebPushPrompt {...props} />);
      await waitFor(() => {
        expect(webPush.getWebPushState).toHaveBeenCalled();
      });
      expect(remounted.container).toBeEmptyDOMElement();
    });

    it("keeps dismissals scoped to one surface", async () => {
      dismissWebPushPrompt("saved");
      render(<WebPushPrompt {...props} promptId="deadlines" />);

      expect(
        await screen.findByRole("button", { name: /turn on reminders/i }),
      ).toBeInTheDocument();
    });
  });
});
