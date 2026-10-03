/** RNG determinístico (mulberry32). Use sempre este em vez de Math.random para permitir replays e testes. */
export class Rng {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed >>> 0;
  }

  get seed(): number {
    return this.state;
  }

  /** Volta a sequência a um ponto salvo com `seed` (para desfazer e repetir uma ação). */
  reseed(state: number): void {
    this.state = state >>> 0;
  }

  /** Float em [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max] (inclusivo). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick em lista vazia');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Sub-RNG independente, útil para dar a cada sistema a própria sequência. */
  fork(): Rng {
    return new Rng(this.int(0, 0xffffffff));
  }
}
