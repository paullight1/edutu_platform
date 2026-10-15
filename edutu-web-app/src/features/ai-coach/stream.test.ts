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

it("reports progress while the coach checks records before replying", async () => {
  const payload = [
    'event: turn.start\ndata: {}',
    'event: token\ndata: {"content":"Let me check"}',
    'event: tool.start\ndata: {"id":"one","name":"search_opportunities"}',
    'event: tool.result\ndata: {"id":"one","name":"search_opportunities","ok":true}',
    'event: token\ndata: {"content":"Here is what I found"}',
    'event: turn.final\ndata: {"reply":"Here is what I found"}',
  ].join("\n\n") + "\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  const phases: string[] = [];
  const visible: string[] = [];
  await consumeCoachStream(
    stream,
    (value) => visible.push(value),
    (phase) => phases.push(phase),
  );
  expect(phases).toEqual(["thinking", "writing", "checking", "thinking", "writing"]);
  expect(visible).toContain("");
  expect(visible.at(-1)).toBe("Here is what I found");
});
