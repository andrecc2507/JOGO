import { describe, expect, it, vi } from 'vitest';
import { IsoCamera, ROTATE_TIME, TILE_H, TILE_W, STEP_H } from '@game/render/iso';
import { createEmptyMap, type BattleMap } from '@game/battle/map';

/** Projeção antiga (4 vistas fixas), para garantir que parada a câmera não mudou nada. */
function oldProject(cam: IsoCamera, map: BattleMap, x: number, y: number, h: number): [number, number] {
  const [rx, ry] = cam.rotated(map, x, y);
  const rw = cam.rot % 2 === 0 ? map.w : map.h;
  const rh = cam.rot % 2 === 0 ? map.h : map.w;
  const ox = cam.viewW / 2 + cam.panX;
  const oy = cam.viewH / 2 + cam.panY - ((rw + rh) * TILE_H * cam.zoom) / 4 + 20 * cam.zoom;
  return [ox + ((rx - ry) * TILE_W * cam.zoom) / 2 - (((rw - rh) * TILE_W) / 4) * cam.zoom, oy + ((rx + ry) * TILE_H * cam.zoom) / 2 - h * STEP_H * cam.zoom];
}

describe('câmera isométrica', () => {
  it('nas 4 vistas, a projeção é a mesma de antes', () => {
    const map = createEmptyMap(13, 9, 'planicie');
    const cam = new IsoCamera(1280, 720);
    cam.zoom = 1.2;
    cam.panX = 15;
    for (let r = 0; r < 4; r++) {
      cam.snapTo(r);
      for (const [x, y, h] of [[0, 0, 0], [12, 8, 3], [5, 2, 1]] as const) {
        const [a, b] = cam.project(map, x, y, h);
        const [c, d] = oldProject(cam, map, x, y, h);
        expect(a).toBeCloseTo(c, 6);
        expect(b).toBeCloseTo(d, 6);
      }
    }
  });

  it('o giro é contínuo: no meio dele o ângulo fica entre as duas vistas e no fim chega à nova', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const perf = vi.spyOn(performance, 'now');
    let t = 1000;
    perf.mockImplementation(() => t);
    const map = createEmptyMap(10, 10, 'planicie');
    const cam = new IsoCamera(800, 600);
    cam.snapTo(0);
    const before = cam.project(map, 9, 0, 0);
    cam.rotate(1);
    expect(cam.rot).toBe(1);
    t += (ROTATE_TIME * 1000) / 2;
    expect(cam.rotating()).toBe(true);
    expect(cam.turn()).toBeGreaterThan(0.2);
    expect(cam.turn()).toBeLessThan(0.8);
    const mid = cam.project(map, 9, 0, 0);
    t += ROTATE_TIME * 1000;
    const after = cam.project(map, 9, 0, 0);
    expect(cam.turn()).toBe(1);
    // O canto passa por posições intermediárias (não pula).
    expect(mid).not.toEqual(before);
    expect(mid).not.toEqual(after);
    // Dar a volta pelo outro lado também é suave (não gira 270° ao contrário).
    cam.rotate(-1);
    cam.rotate(-1);
    t += ROTATE_TIME * 1000 * 2;
    expect(cam.rot).toBe(3);
    perf.mockRestore();
    vi.useRealTimers();
  });

  it('ordem de desenho acompanha o ângulo', () => {
    const map = createEmptyMap(4, 4, 'planicie');
    const cam = new IsoCamera(800, 600);
    cam.snapTo(0);
    expect(cam.drawOrder(map)[0]).toEqual([0, 0]);
    cam.snapTo(2);
    expect(cam.drawOrder(map)[0]).toEqual([3, 3]);
  });
});
