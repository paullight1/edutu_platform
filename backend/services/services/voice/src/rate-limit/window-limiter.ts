export class WindowRateLimiter {
  private readonly states = new Map<string, { startedAt: number; count: number }>();

  public constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now = () => Date.now(),
  ) {}

  public consume(key: string): boolean {
    const now = this.now();
    const state = this.states.get(key);
    if (!state || now - state.startedAt >= this.windowMs) {
      this.states.set(key, { startedAt: now, count: 1 });
      return true;
    }
    state.count += 1;
    return state.count <= this.limit;
  }

  public delete(key: string): void {
    this.states.delete(key);
  }
}
