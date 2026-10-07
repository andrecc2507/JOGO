import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROUP_LABEL, PROPS, TERRAIN, createEmptyMap, isWalkable } from '@game/battle/map';
import { STRUCTURES, stamp, type StructureId } from '@game/mapgen/structures';
import { THEMES, generateTheme, type ThemeId } from '@game/mapgen/themes';
import { MapHistory, floodTerrain, rectTiles } from '@game/mapgen/edit_ops';
import { mapConnected } from '@game/mapgen/generator';

describe('editor de mapas: conteúdo', () => {
  it('todo terreno e objeto tem grupo da paleta; todo objeto tem desenho próprio', () => {
    for (const v of [...Object.values(TERRAIN), ...Object.values(PROPS)]) expect(GROUP_LABEL[v.group]).toBeTruthy();
    const art = readFileSync('src/game/render/prop_art.ts', 'utf8');
    for (const id of Object.keys(PROPS)) expect(art, id).toContain(`case '${id}':`);
    const tex = readFileSync('src/game/render/terrain_art.ts', 'utf8');
    for (const [id, v] of Object.entries(TERRAIN)) if (v.tex) expect(tex, id).toContain(`case '${v.tex}':`);
  });

  it('casa: oca, telhado de palha por cima, cumeeira no meio, porta na frente', () => {
    const map = createEmptyMap(10, 10, 'planicie');
    stamp(map, 'casa_vila', 2, 2, 4, 3);
    const t = (x: number, y: number) => map.tiles[y * map.w + x]!;
    const roofOf = (x: number, y: number) => t(x, y).up![t(x, y).up!.length - 1]!;
    expect(roofOf(2, 2).t).toBe('palha');
    expect(roofOf(2, 2).h).toBe(1 + 3);
    expect(roofOf(3, 3).h).toBe(1 + 4);
    expect(t(3, 4).door).toBe(true);
    expect(t(1, 2).t).toBe('grama');
    expect(isWalkable(t(3, 3))).toBe(true);
  });

  it('todas as estruturas carimbam sem quebrar e respeitam o tamanho', () => {
    for (const id of Object.keys(STRUCTURES) as StructureId[]) {
      const map = createEmptyMap(16, 16, 'planicie');
      const n = stamp(map, id, 3, 3);
      expect(n, id).toBe(STRUCTURES[id].w * STRUCTURES[id].h);
    }
  });

  it('cenários da história: spawns dos dois lados e caminho entre eles', () => {
    for (const theme of Object.keys(THEMES) as ThemeId[])
      for (const seed of [1, 7, 42]) {
        const map = generateTheme(theme, 16, 14, seed);
        const a = map.tiles.findIndex((t) => t.spawn === 'player');
        const b = map.tiles.findIndex((t) => t.spawn === 'enemy');
        expect(a, `${theme}/${seed}`).toBeGreaterThanOrEqual(0);
        expect(b, `${theme}/${seed}`).toBeGreaterThanOrEqual(0);
        expect(mapConnected(map, a, b), `${theme}/${seed}`).toBe(true);
      }
  });

  it('balde, retângulo e desfazer/refazer', () => {
    const map = createEmptyMap(6, 6, 'planicie');
    map.tiles[0]!.h = 3;
    expect(floodTerrain(map, 2, 2, 'paralelepipedo')).toBe(35);
    expect(map.tiles[0]!.t).toBe('grama');
    expect(rectTiles(map, [4, 4], [1, 2])).toHaveLength(4 * 3);
    const hist = new MapHistory();
    hist.record(map);
    map.tiles[5]!.t = 'lava';
    expect(hist.undo(map)).toBe(true);
    expect(map.tiles[5]!.t).toBe('paralelepipedo');
    expect(hist.redo(map)).toBe(true);
    expect(map.tiles[5]!.t).toBe('lava');
  });
});
