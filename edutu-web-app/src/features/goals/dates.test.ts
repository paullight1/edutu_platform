import { expect, it } from "vitest";
import { dateInputToIso, dateToInput } from "./dates";
it("round trips a local calendar date without crossing midnight", () => {
  const iso = dateInputToIso("2026-10-01");
  expect(dateToInput(iso)).toBe("2026-10-01");
  expect(new Date(iso!).getHours()).toBe(12);
});
it("rejects invalid dates rather than normalizing to another month", () => {
  expect(() => dateInputToIso("2026-02-30")).toThrow();
  expect(dateInputToIso("")).toBeNull();
});
