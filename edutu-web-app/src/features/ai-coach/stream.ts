import { getApiBaseUrl } from "../../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../../lib/localDevAuthHeaders";
import {
  ProductApiError,
  UpgradeRequiredError,
} from "../../services/productApi";
export interface CoachMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: {
    opportunities?: Array<{
      id: string;
      title: string;
      organization?: string;
    }>;
    actions?: Array<{ label: string; payload: Record<string, unknown> }>;
  };
}
export interface CoachTurn {
  threadId: string;
  userMessage: CoachMessage;
  assistantMessage: CoachMessage;
}
function isCoachMessage(value: unknown, role: "user" | "assistant"): value is CoachMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<CoachMessage>;
  return typeof message.id === "string" && !!message.id &&
    message.role === role && typeof message.content === "string";
}
export async function consumeCoachStream<T = CoachTurn>(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    text = "",
    final: T | undefined;
  function frame(raw: string) {
    const lines = raw.split("\n");
    const event = lines
      .find((l) => l.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const value = JSON.parse(data);
    if (event === "tool.start") {
      text = "";
      onText(text);
    }
    if (event === "token") {
      text += value.content || "";
      onText(text);
    }
    if (event === "turn.final") {
      final = value;
      text = value.assistantMessage?.content || value.reply || text;
      onText(text);
    }
    if (event === "turn.error") {
      if (
        (value.status === 402 && ["insufficient_credits", "paid_plan_required"].includes(value.code)) ||
        (value.status === 429 && value.code === "limit")
      )
        throw new UpgradeRequiredError(
          value.message || "Your AI allowance is exhausted",
          value.code,
          value.status,
          value.required,
        );
      throw new ProductApiError(
        value.message || value.error || "Coach could not complete this turn",
        value.status || 500,
        value.code,
      );
    }
  }
  try {
    let ended = false;
    while (!ended) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let pos;
      while ((pos = buffer.indexOf("\n\n")) >= 0) {
        frame(buffer.slice(0, pos));
        buffer = buffer.slice(pos + 2);
        if (final !== undefined) return final;
      }
      if (chunk.done) ended = true;
    }
    if (buffer.trim()) frame(buffer);
    if (!final)
      throw new Error(
        "The reply was interrupted. Check conversation history before sending again.",
      );
    return final;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function sendCoachTurn(
  token: string,
  input: {
    message: string;
    threadId?: string | null;
    channel?: "text" | "voice";
    locale?: string;
    context?: unknown;
    intent?: "free_chat" | "fit_check" | "next_move" | "review_doc" | "whats_missing";
  },
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<CoachTurn> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          "Coach reply timed out. Check history before sending again.",
          "TimeoutError",
        ),
      ),
    120000,
  );
  try {
    const response = await fetch(
      `${getApiBaseUrl("Coach")}/web-tools/chat/messages/stream`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...getLocalDevAuthHeaders(),
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (
        [402, 429].includes(response.status) &&
        ["limit", "insufficient_credits", "paid_plan_required"].includes(error.code)
      )
        throw new UpgradeRequiredError(
          error.message || "Your AI allowance is exhausted",
          error.code,
          response.status,
          error.required,
        );
      throw new ProductApiError(
        error.message || "Coach could not connect",
        response.status,
        error.code,
      );
    }
    if (!response.body)
      throw new Error("Streaming is unavailable in this browser");
    const turn = await consumeCoachStream<Partial<CoachTurn> | null>(response.body, onText);
    if (
      !turn || typeof turn.threadId !== "string" || !turn.threadId ||
      !isCoachMessage(turn.userMessage, "user") ||
      !isCoachMessage(turn.assistantMessage, "assistant")
    ) throw new Error("Coach returned an invalid reply. Check conversation history before sending again.");
    return turn as CoachTurn;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
