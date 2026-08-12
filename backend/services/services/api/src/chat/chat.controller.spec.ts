import { EventEmitter } from "events";
import type { Response } from "express";
import { ChatController } from "./chat.controller";
import type { ChatService } from "./chat.service";

function responseStub() {
  const response = new EventEmitter() as EventEmitter &
    Pick<Response, "setHeader" | "flushHeaders" | "write" | "end"> & {
      writableEnded: boolean;
    };
  response.writableEnded = false;
  response.setHeader = jest.fn();
  response.flushHeaders = jest.fn();
  response.write = jest.fn();
  response.end = jest.fn(() => {
    response.writableEnded = true;
    return response;
  });
  return response;
}

describe("ChatController.sendMessageStream", () => {
  it("passes a request abort signal to chat generation and aborts it on disconnect", async () => {
    let resolveTurn!: (value: unknown) => void;
    const sendMessage = jest.fn(
      (_userId: string, _body: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          resolveTurn = () => resolve(options);
        }),
    );
    const controller = new ChatController({
      sendMessage,
    } as unknown as ChatService);
    const response = responseStub();

    const pending = controller.sendMessageStream(
      "user-1",
      "auth-1",
      { message: "hello" },
      response as unknown as Response,
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    response.emit("close");
    resolveTurn(undefined);
    await pending;

    const options = sendMessage.mock.calls[0][2] as { signal?: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(true);
  });

  it("does not rethrow a provider abort after the client has disconnected", async () => {
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    const sendMessage = jest.fn().mockRejectedValue(abortError);
    const controller = new ChatController({
      sendMessage,
    } as unknown as ChatService);
    const response = responseStub();

    const pending = controller.sendMessageStream(
      "user-1",
      "auth-1",
      { message: "hello" },
      response as unknown as Response,
    );
    response.emit("close");

    await expect(pending).resolves.toBeUndefined();
    expect(response.write).toHaveBeenCalledTimes(1); // turn.start only
  });
});
