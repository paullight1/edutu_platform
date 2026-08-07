import { ScraperRunControl } from "./scraper-run-control";

describe("ScraperRunControl", () => {
  it("moves through pause, resume, and stop without losing control events", () => {
    const events: string[] = [];
    const control = new ScraperRunControl();
    control.begin((event) => {
      if (event.type === "control") events.push(event.state);
    });

    expect(control.pause()).toEqual({ ok: true, status: "paused" });
    expect(control.resume()).toEqual({ ok: true, status: "running" });
    expect(control.stop()).toEqual({ ok: true, status: "stopping" });
    expect(control.status()).toEqual({
      running: true,
      paused: false,
      stopping: true,
    });
    expect(events).toEqual(["paused", "resumed", "stopping"]);

    control.finish();
    expect(control.status()).toEqual({
      running: false,
      paused: false,
      stopping: false,
    });
  });

  it("rejects controls while idle", () => {
    const control = new ScraperRunControl();
    expect(control.pause()).toEqual({ ok: false, status: "idle" });
    expect(control.resume()).toEqual({ ok: false, status: "idle" });
    expect(control.stop()).toEqual({ ok: false, status: "idle" });
  });
});
