const metricNamePattern = /^[a-z][a-z0-9_]*$/;

export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly help = new Map<string, string>();

  public increment(name: string, amount = 1, help?: string): void {
    this.assertName(name);
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
    if (help) this.help.set(name, help);
  }

  public set(name: string, value: number, help?: string): void {
    this.assertName(name);
    this.gauges.set(name, value);
    if (help) this.help.set(name, help);
  }

  public snapshot(): Readonly<Record<string, number>> {
    return Object.freeze(Object.fromEntries([...this.counters, ...this.gauges]));
  }

  public toPrometheus(): string {
    const lines: string[] = [];
    for (const [name, value] of [...this.counters].sort()) {
      lines.push(`# HELP ${name} ${this.help.get(name) ?? name}`, `# TYPE ${name} counter`, `${name} ${value}`);
    }
    for (const [name, value] of [...this.gauges].sort()) {
      lines.push(`# HELP ${name} ${this.help.get(name) ?? name}`, `# TYPE ${name} gauge`, `${name} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private assertName(name: string): void {
    if (!metricNamePattern.test(name)) throw new Error(`Invalid metric name: ${name}`);
  }
}
