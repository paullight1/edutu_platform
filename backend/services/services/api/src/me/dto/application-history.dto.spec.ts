import { AddApplicationReflectionSchema } from "./application-history.dto";

describe("AddApplicationReflectionSchema", () => {
  it("accepts a trimmed reflection", () => {
    expect(
      AddApplicationReflectionSchema.parse({ reflection: "  Improve evidence  " }),
    ).toEqual({ reflection: "Improve evidence" });
  });

  it("rejects empty reflections", () => {
    expect(
      AddApplicationReflectionSchema.safeParse({ reflection: "   " }).success,
    ).toBe(false);
  });

  it("rejects oversized reflections", () => {
    expect(
      AddApplicationReflectionSchema.safeParse({ reflection: "x".repeat(2001) })
        .success,
    ).toBe(false);
  });
});
