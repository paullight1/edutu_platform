import "../../i18n";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { COACH_NEW_CONVERSATION_EVENT } from "./coachEvents";

const { request, token, sendTurn } = vi.hoisted(() => ({
  request: vi.fn(), token: vi.fn(), sendTurn: vi.fn(),
}));
vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>("../workspace/shared")),
  useProductSession: () => ({ request, token, userId: "owner" }),
}));
vi.mock("../../hooks/usePaywall", () => ({
  usePaywall: () => ({ refreshBilling: vi.fn(), handleUpgradeError: () => false }),
}));
vi.mock("./stream", () => ({ sendCoachTurn: sendTurn }));
import CoachPage from "./CoachPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function renderCoach() {
  return render(<MemoryRouter><CoachPage /></MemoryRouter>);
}
async function sendQuestion() {
  await screen.findByText("I’m Edutu, your AI Coach");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Help with my application" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(sendTurn).toHaveBeenCalledTimes(1));
}
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  token.mockResolvedValue("token");
  request.mockResolvedValue({ threads: [] });
});

it("new conversation invalidates pending history and leaves the composer usable", async () => {
  const history = deferred<{ threads: { id: string; title: string }[] }>();
  request.mockReturnValueOnce(history.promise);
  renderCoach();
  act(() => { window.dispatchEvent(new Event(COACH_NEW_CONVERSATION_EVENT)); });
  expect(await screen.findByText("I’m Edutu, your AI Coach")).toBeInTheDocument();
  await act(async () => { history.resolve({ threads: [{ id: "old", title: "Old" }] }); });
  expect(request).not.toHaveBeenCalledWith("/chat/threads/old/messages", expect.anything());
});

it("does not append a cancelled reply to a new conversation", async () => {
  const turn = deferred<never>();
  sendTurn.mockReturnValueOnce(turn.promise);
  renderCoach();
  await sendQuestion();
  act(() => { window.dispatchEvent(new Event(COACH_NEW_CONVERSATION_EVENT)); });
  await act(async () => { turn.reject(new DOMException("Aborted", "AbortError")); });
  expect(await screen.findByText("I’m Edutu, your AI Coach")).toBeInTheDocument();
  expect(screen.queryByText(/You stopped before/)).not.toBeInTheDocument();
});

it("preserves partial replies with an interruption notice after a network failure", async () => {
  const turn = deferred<never>();
  sendTurn.mockImplementationOnce((_token, _input, _signal, onText) => {
    onText("Start by checking the eligibility requirements.");
    return turn.promise;
  });
  renderCoach();
  await sendQuestion();
  await act(async () => { turn.reject(new Error("Connection interrupted. Check conversation history.")); });
  expect(screen.getByText("Start by checking the eligibility requirements.")).toBeInTheDocument();
  expect(screen.getByText(/connection dropped/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /history/i })).toBeInTheDocument();
});

it("blocks unsafe document and image URLs in AI history", async () => {
  request.mockImplementation(async (path: string) => path === "/chat/threads"
    ? { threads: [{ id: "old", title: "Old" }] }
    : { messages: [{ id: "m", role: "assistant", content: "Your document", metadata: {
      documents: [{ docId: "d", type: "essay", title: "Essay", version: 1, url: "javascript:alert(1)" }],
      images: [{ url: "data:text/html,unsafe", title: "Unsafe image" }],
    } }] });
  renderCoach();
  expect(await screen.findByRole("link", { name: /Essay/ })).toHaveAttribute("href", "/app/documents");
  expect(screen.queryByRole("img", { name: "Unsafe image" })).not.toBeInTheDocument();
});

it("copies a coach reply without exposing hidden context", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  request.mockImplementation(async (path: string) => path === "/chat/threads"
    ? { threads: [{ id: "old", title: "Old" }] }
    : { messages: [{ id: "m", role: "assistant", content: "Check your eligibility.\u2063\u2063EDUTU_CTX\u2063\u2063private context" }] });
  renderCoach();
  fireEvent.click(await screen.findByRole("button", { name: "Copy response" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("Check your eligibility."));
  expect(await screen.findByText("Response copied.")).toBeInTheDocument();
});
