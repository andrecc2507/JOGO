import type { Renderer } from '@core';

export interface PointerClick {
  x: number;
  y: number;
  button: number;
}

/**
 * Entrada de mouse restrita ao canvas (cliques na UI em DOM não vazam para o jogo).
 * Botão esquerdo = clique; direito/meio arrastando = pan; roda = zoom.
 */
export class CanvasPointer {
  x = 0;
  y = 0;
  inside = false;
  leftDown = false;
  clicks: PointerClick[] = [];
  wheel = 0;
  dragDX = 0;
  dragDY = 0;
  private downAt: { x: number; y: number; button: number } | null = null;
  private dragging = false;
  private readonly off: (() => void)[] = [];

  constructor(private readonly renderer: Renderer) {
    const c = renderer.canvas;
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn as EventListener);
      this.off.push(() => el.removeEventListener(type, fn as EventListener));
    };
    on(c, 'mousemove', (e) => {
      const p = renderer.toLocal(e.clientX, e.clientY);
      if (this.downAt && this.downAt.button !== 0) {
        this.dragDX += p.x - this.x;
        this.dragDY += p.y - this.y;
        if (Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 4) this.dragging = true;
      }
      this.x = p.x;
      this.y = p.y;
      this.inside = true;
    });
    on(c, 'mouseleave', () => {
      this.inside = false;
      this.leftDown = false;
    });
    on(c, 'mousedown', (e) => {
      const p = renderer.toLocal(e.clientX, e.clientY);
      this.downAt = { x: p.x, y: p.y, button: e.button };
      this.dragging = false;
      if (e.button === 0) this.leftDown = true;
    });
    on(window, 'mouseup', (e) => {
      if (this.downAt && !this.dragging && e.target === c) this.clicks.push({ x: this.x, y: this.y, button: this.downAt.button });
      this.downAt = null;
      this.leftDown = false;
    });
    on(c, 'contextmenu', (e) => e.preventDefault());
    on(c, 'wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    });
  }

  takeClicks(): PointerClick[] {
    const out = this.clicks;
    this.clicks = [];
    return out;
  }

  takeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  takeDrag(): [number, number] {
    const d: [number, number] = [this.dragDX, this.dragDY];
    this.dragDX = 0;
    this.dragDY = 0;
    return d;
  }

  dispose(): void {
    for (const f of this.off) f();
  }
}
