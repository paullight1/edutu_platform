import { renderHook, act } from "@testing-library/react";
import { beforeEach, it, expect } from "vitest";
import { useDraftRecovery } from "./useDraftRecovery";
beforeEach(() => sessionStorage.clear());
it("flushes edits immediately and removes them after a successful save", () => {
  const { rerender } = renderHook(
    ({ dirty, value }) => useDraftRecovery("owner.cv", value, dirty),
    { initialProps: { dirty: false, value: "saved" } },
  );
  rerender({ dirty: true, value: "important edit" });
  expect(sessionStorage.getItem("owner.cv")).toBe('"important edit"');
  rerender({ dirty: false, value: "important edit" });
  expect(sessionStorage.getItem("owner.cv")).toBeNull();
});
it("offers recovery only for the exact owner and record", () => {
  sessionStorage.setItem("owner-a.cv-1", '"private edit"');
  const { result, rerender } = renderHook(
    ({ key }) => useDraftRecovery(key, "saved", false),
    { initialProps: { key: "owner-b.cv-1" } },
  );
  expect(result.current.recovered).toBeNull();
  rerender({ key: "owner-a.cv-1" });
  expect(result.current.recovered).toBe("private edit");
  act(() => result.current.discard());
  expect(sessionStorage.getItem("owner-a.cv-1")).toBeNull();
});
