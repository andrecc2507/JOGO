export interface LoopCallbacks {
  /** Início do frame (troca de cena, etc.). */
  beginFrame?(): void;
  /** Tick fixo de simulação. */
  update(dt: number): void;
  /** Desenho; alpha = fração do próximo tick já decorrida. */
  render(alpha: number): void;
}

/**
 * Loop com passo fixo (simulação determinística) e render livre.
 * `advance()` pode ser chamado manualmente em testes, sem requestAnimationFrame.
 */
export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private rafId: number | null = null;

  constructor(
    private readonly callbacks: LoopCallbacks,
    readonly fixedDt = 1 / 60,
    /** Limite de ticks por frame para evitar "espiral da morte" após travadas. */
    private readonly maxTicksPerFrame = 5,
  ) {}

  get running(): boolean {
    return this.rafId !== null;
  }

  start(): void {
    if (this.running) return;
    this.last = performance.now();
    const frame = (now: number) => {
      this.advance((now - this.last) / 1000);
      this.last = now;
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** Avança o tempo real `elapsed` segundos. Retorna quantos ticks rodaram. */
  advance(elapsed: number): number {
    this.callbacks.beginFrame?.();
    this.accumulator = Math.min(this.accumulator + elapsed, this.fixedDt * this.maxTicksPerFrame);
    let ticks = 0;
    while (this.accumulator >= this.fixedDt) {
      this.callbacks.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
      ticks++;
    }
    this.callbacks.render(this.accumulator / this.fixedDt);
    return ticks;
  }
}
