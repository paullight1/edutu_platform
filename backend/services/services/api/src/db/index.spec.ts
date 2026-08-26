import { EventEmitter } from "node:events";
import type { PoolClient } from "pg";
import { pool } from ".";

describe("database pool resilience", () => {
  it("keeps a checked-out client socket error from becoming uncaught", () => {
    const client = new EventEmitter() as PoolClient;
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    const socketError = Object.assign(new Error("socket unavailable"), {
      code: "EADDRNOTAVAIL",
    });

    try {
      pool.emit("connect", client);

      expect(() => client.emit("error", socketError)).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected database client error",
        socketError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
