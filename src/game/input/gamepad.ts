/**
 * Controle (Gamepad API; Steam Deck e controles de Xbox/PlayStation): os botões viram códigos
 * virtuais (`PadA`, `PadB`, `PadLB`…) ligados às ações em `config/input.config.ts`, e o analógico
 * esquerdo move um cursor na tela que clica com A (serve para mapa, batalha e menus).
 */
interface PadInput {
  press(code: string): void;
  release(code: string): void;
}

const BUTTONS: Record<number, string> = {
  0: 'PadA',
  1: 'PadB',
  2: 'PadX',
  3: 'PadY',
  4: 'PadLB',
  5: 'PadRB',
  8: 'PadSelect',
  9: 'PadStart',
  12: 'PadUp',
  13: 'PadDown',
  14: 'PadLeft',
  15: 'PadRight',
};
const DEAD = 0.25;
const CURSOR_SPEED = 900;

let cursor: HTMLDivElement | null = null;
let cx = 0;
let cy = 0;

function ensureCursor(): HTMLDivElement {
  if (cursor) return cursor;
  cursor = document.createElement('div');
  cursor.className = 'pad-cursor';
  document.body.append(cursor);
  cx = window.innerWidth / 2;
  cy = window.innerHeight / 2;
  return cursor;
}

function fire(type: string, x: number, y: number, button = 0): void {
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button, view: window };
  if (type === 'click') el.dispatchEvent(new MouseEvent('click', init));
  else if (type.startsWith('pointer')) el.dispatchEvent(new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true }));
  else el.dispatchEvent(new MouseEvent(type, init));
}

export function attachGamepad(input: PadInput): void {
  if (typeof window === 'undefined' || !('getGamepads' in navigator)) return;
  const prev = new Map<string, boolean>();
  let last = performance.now();
  const set = (code: string, on: boolean) => {
    if (prev.get(code) === on) return;
    prev.set(code, on);
    if (on) input.press(code);
    else input.release(code);
  };
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const pad = [...navigator.getGamepads()].find((p) => p && p.connected);
    if (pad) {
      for (const [i, code] of Object.entries(BUTTONS)) set(code, !!pad.buttons[Number(i)]?.pressed);
      // Analógico direito: mover a câmera.
      const [, , rx = 0, ry = 0] = pad.axes;
      set('PadRLeft', rx < -0.5);
      set('PadRRight', rx > 0.5);
      set('PadRUp', ry < -0.5);
      set('PadRDown', ry > 0.5);
      // Analógico esquerdo: cursor virtual.
      const [lx = 0, ly = 0] = pad.axes;
      if (Math.abs(lx) > DEAD || Math.abs(ly) > DEAD) {
        const el = ensureCursor();
        cx = Math.max(0, Math.min(window.innerWidth - 1, cx + lx * CURSOR_SPEED * dt));
        cy = Math.max(0, Math.min(window.innerHeight - 1, cy + ly * CURSOR_SPEED * dt));
        el.style.transform = `translate(${cx}px, ${cy}px)`;
        el.style.display = 'block';
        fire('pointermove', cx, cy);
        fire('mousemove', cx, cy);
      }
      // A com o cursor visível: clique onde ele está.
      const a = !!pad.buttons[0]?.pressed;
      const wasA = prev.get('cursorA') ?? false;
      if (cursor && cursor.style.display === 'block' && a !== wasA) {
        if (a) {
          fire('pointerdown', cx, cy);
          fire('mousedown', cx, cy);
        } else {
          fire('pointerup', cx, cy);
          fire('mouseup', cx, cy);
          fire('click', cx, cy);
        }
      }
      prev.set('cursorA', a);
      // B fecha a janela aberta (o ✕ do topo), como Esc.
      const b = !!pad.buttons[1]?.pressed;
      if (b && !prev.get('closeB')) (document.querySelector('.modal-backdrop:last-of-type .modal-header .btn.ghost') as HTMLElement | null)?.click();
      prev.set('closeB', b);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
