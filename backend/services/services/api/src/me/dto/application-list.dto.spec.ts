import { describe, expect, it } from "@jest/globals";
import { UpdateApplicationSchema } from "./me.dto";

describe("application optimistic concurrency", () => {
  it("accepts a positive expected version from the tracker", () => {
    expect(
      UpdateApplicationSchema.parse({
        status: "submitted",
        expectedVersion: 2,
      }),
    ).toMatchObject({ expectedVersion: 2 });
  });
  it("rejects invalid versions", () => {
    expect(
      UpdateApplicationSchema.safeParse({
        status: "submitted",
        expectedVersion: 0,
      }).success,
    ).toBe(false);
  });
});
