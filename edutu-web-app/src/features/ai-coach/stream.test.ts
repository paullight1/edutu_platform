import { it, expect, vi } from "vitest";
import { consumeCoachStream, sendCoachTurn } from "./stream";
import { UpgradeRequiredError } from "../../services/productApi";
it("reconciles tool preambles and final replies across Unicode chunks", async () => {
  const bytes = new TextEncoder().encode(
    'event: token\ndata: {"content":"Let me check"}\n\nevent: tool.start\ndata: {"id":"a"}\n\nevent: token\ndata: {"content":"你好"}\n\nevent: turn.final\ndata: {"reply":"你好 — final","thread":{"id":"t1"}}\n\n',
  );
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 3)
        c.enqueue(bytes.slice(i, i + 3));
      c.close();
    },
  });
  const texts: string[] = [];
  const result = await consumeCoachStream<{ thread: { id: string } }>(
    stream,
    (text) => texts.push(text),
  );
  expect(texts).toContain("");
  expect(texts[texts.length - 1]).toBe("你好 — final");
  expect(result.thread.id).toBe("t1");
});

it("finishes and cancels the connection as soon as the final turn arrives", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: turn.final\ndata: {"reply":"Done"}\n\n'));
      // A proxy may keep the socket open after the authoritative final frame.
    },
    cancel,
  });
  const result = await Promise.race([
    consumeCoachStream<{ reply: string }>(stream, () => {}),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Waited for socket closure")), 100)),
  ]);
  expect(result.reply).toBe("Done");
  expect(cancel).toHaveBeenCalledOnce();
});

it("preserves allowance errors sent after streaming headers", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: turn.error\ndata: {"message":"Allowance exhausted","status":429,"code":"limit"}\n\n'));
      controller.close();
    },
  });
  await expect(consumeCoachStream(stream, () => {})).rejects.toBeInstanceOf(UpgradeRequiredError);
});

it("rejects an invalid final turn before it can corrupt the conversation UI", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: turn.final\ndata: {"reply":"Incomplete contract"}\n\n'));
      controller.close();
    },
  });
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
  try {
    await expect(sendCoachTurn("token", { message: "Hello" }, new AbortController().signal, () => {}))
      .rejects.toThrow(/invalid.*history/i);
  } finally {
    fetcher.mockRestore();
  }
});
it("rejects incomplete streams instead of pretending partial text is saved", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(
        new TextEncoder().encode(
          'event: token\ndata: {"content":"partial"}\n\n',
        ),
      );
      c.close();
    },
  });
  await expect(consumeCoachStream(stream, () => {})).rejects.toThrow(
    /interrupted/i,
  );
});
