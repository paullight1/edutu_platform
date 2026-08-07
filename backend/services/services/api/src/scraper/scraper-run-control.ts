import type { ActiveRunControl, ScrapeEventListener } from "./scraper.types";

export type ScraperRunStatus = {
  running: boolean;
  paused: boolean;
  stopping: boolean;
};

/** In-memory control for the advisory-locked run owned by this process. */
export class ScraperRunControl {
  private active: ActiveRunControl | null = null;

  begin(emit?: ScrapeEventListener): void {
    this.active = { paused: false, stopRequested: false, emit };
  }

  finish(): void {
    this.active = null;
  }

  pause(): { ok: boolean; status: string } {
    if (!this.active || this.active.stopRequested) {
      return { ok: false, status: this.active ? "stopping" : "idle" };
    }
    this.active.paused = true;
    this.active.emit?.({ type: "control", state: "paused" });
    return { ok: true, status: "paused" };
  }

  resume(): { ok: boolean; status: string } {
    if (!this.active || this.active.stopRequested) {
      return { ok: false, status: this.active ? "stopping" : "idle" };
    }
    this.active.paused = false;
    this.active.emit?.({ type: "control", state: "resumed" });
    return { ok: true, status: "running" };
  }

  stop(): { ok: boolean; status: string } {
    if (!this.active) return { ok: false, status: "idle" };
    this.active.stopRequested = true;
    this.active.paused = false;
    this.active.emit?.({ type: "control", state: "stopping" });
    return { ok: true, status: "stopping" };
  }

  status(): ScraperRunStatus {
    return {
      running: Boolean(this.active),
      paused: Boolean(this.active?.paused),
      stopping: Boolean(this.active?.stopRequested),
    };
  }

  isStopRequested(): boolean {
    return Boolean(this.active?.stopRequested);
  }

  async waitWhilePaused(
    delay: (milliseconds: number) => Promise<void>,
  ): Promise<void> {
    while (this.active?.paused && !this.active.stopRequested) {
      await delay(400);
    }
  }
}
