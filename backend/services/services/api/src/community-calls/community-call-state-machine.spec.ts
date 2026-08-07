import {
  canTransitionCall,
  isInsideCallStartWindow,
  isTerminalCallStatus,
} from "./community-call-state-machine";

describe("community call state machine", () => {
  it("allows only the documented lifecycle transitions", () => {
    expect(canTransitionCall("scheduled", "starting")).toBe(true);
    expect(canTransitionCall("starting", "live")).toBe(true);
    expect(canTransitionCall("live", "ended")).toBe(true);
    expect(canTransitionCall("scheduled", "live")).toBe(false);
    expect(canTransitionCall("ended", "live")).toBe(false);
    expect(isTerminalCallStatus("failed")).toBe(true);
    expect(isTerminalCallStatus("live")).toBe(false);
  });

  it("uses inclusive early and late start-window boundaries", () => {
    const scheduled = new Date("2026-08-06T12:00:00.000Z");
    expect(
      isInsideCallStartWindow(
        scheduled,
        new Date("2026-08-06T11:55:00.000Z"),
        5,
        30,
      ),
    ).toBe(true);
    expect(
      isInsideCallStartWindow(
        scheduled,
        new Date("2026-08-06T12:30:00.001Z"),
        5,
        30,
      ),
    ).toBe(false);
  });
});
