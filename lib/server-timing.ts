type TimingMeta = Record<string, string | number | boolean | null | undefined>;

function safeToken(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 48) || "stage";
}

export class RequestTimer {
  private readonly startedAt = performance.now();
  private lastMark = this.startedAt;
  private readonly stages: Array<{ name: string; duration: number }> = [];
  readonly requestId = crypto.randomUUID().slice(0, 12);

  constructor(private readonly operation: string) {}

  mark(name: string) {
    const now = performance.now();
    this.stages.push({ name: safeToken(name), duration: now - this.lastMark });
    this.lastMark = now;
  }

  finish(response: Response, meta: TimingMeta = {}) {
    const total = performance.now() - this.startedAt;
    const timing = [
      ...this.stages.map((stage) => `${stage.name};dur=${stage.duration.toFixed(1)}`),
      `total;dur=${total.toFixed(1)}`,
    ].join(", ");
    response.headers.set("Server-Timing", timing);
    response.headers.set("X-Yida-Request-Id", this.requestId);
    console.info(JSON.stringify({
      event: "yida_performance",
      operation: this.operation,
      requestId: this.requestId,
      totalMs: Math.round(total),
      stages: Object.fromEntries(this.stages.map((stage) => [stage.name, Math.round(stage.duration)])),
      ...meta,
    }));
    return response;
  }
}
