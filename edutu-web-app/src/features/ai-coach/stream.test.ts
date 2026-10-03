import { it, expect } from "vitest";
import { consumeCoachStream } from "./stream";
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
