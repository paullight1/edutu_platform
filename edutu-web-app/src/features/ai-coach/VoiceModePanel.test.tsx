import "../../i18n";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, it, expect } from "vitest";
import type {
  RealtimeVoiceSessionHandlers,
  RealtimeVoiceSessionOptions,
} from "./voiceSession";
interface FakeSession {
  handlers: RealtimeVoiceSessionHandlers;
  reject: (error: Error) => void;
}
const { sessions, close } = vi.hoisted(() => ({
  sessions: [] as FakeSession[],
  close: vi.fn(),
}));
vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>(
    "../workspace/shared",
  )),
  useProductSession: () => ({ userId: "voice_owner", token: vi.fn() }),
}));
vi.mock("../../hooks/usePaywall", () => ({
  usePaywall: () => ({ billing: { planTier: "pro" }, billingLoading: false }),
}));
vi.mock("./voiceSession", () => ({
  RealtimeVoiceSession: class {
    handlers: RealtimeVoiceSessionHandlers;
    reject!: (error: Error) => void;
    constructor(options: RealtimeVoiceSessionOptions) {
      this.handlers = options.handlers || {};
      sessions.push(this);
    }
    start() {
      this.handlers.onStatus?.("connecting");
      return new Promise<void>((_resolve, reject) => {
        this.reject = reject;
      });
    }
    close = close;
  },
}));
import VoiceModePanel from "./VoiceModePanel";
it("ends once and ignores late failures from a previous voice session", async () => {
  sessions.length = 0;
  close.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const ended = vi.fn();
  const view = render(
    <VoiceModePanel threadId={null} onThread={vi.fn()} onEnded={ended} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
  act(() => {
    sessions[0].handlers.onError?.(new Error("connection lost"));
    sessions[0].handlers.onReconnectNeeded?.();
  });
  expect(ended).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
  await act(async () => {
    sessions[0].reject(new Error("late offer failure"));
  });
  expect(ended).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "End" })).toBeInTheDocument();
  view.unmount();
  expect(ended).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(2);
});
