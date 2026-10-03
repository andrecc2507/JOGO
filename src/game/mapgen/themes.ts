/**
 * Cenários prontos dos ambientes da história, para o editor de mapas (e missões feitas à mão):
 * vila, cidade, porto, caverna, templo/palácio, guilda do deserto, citadela arruinada e o Vazio.
 * Usam as estruturas (mapgen/structures.ts), deixam as 3 colunas de cada ponta livres para os
 * spawns e garantem caminho entre eles.
 */
import { Rng } from '@core';
import type { Biome } from '../data';
import { TERRAIN, createEmptyMap, inBounds, type BattleMap, type Prop, type Terrain, type Tile } from '../battle/map';
import { ensureConnected, markSpawns } from './generator';
import { stamp, type StructureId } from './structures';

export type ThemeId = 'vila' | 'cidade' | 'porto' | 'caverna' | 'templo' | 'deserto' | 'citadela' | 'vazio';

export const THEMES: Record<ThemeId, { name: string; hint: string; biome: Biome }> = {
  vila: { name: '🏡 Vila', hint: 'Aldeias de Aurélia e Silvânia (Atos 1–2)', biome: 'planicie' },
  cidade: { name: '🏰 Cidade', hint: 'Ruas de pedra, casas de ardósia, praça', biome: 'planicie' },
  porto: { name: '⚓ Porto', hint: 'Bastiamar, Marenhal', biome: 'costa' },
  caverna: { name: '⛰ Caverna', hint: 'Minas, grutas, covis de feras', biome: 'planicie' },
  templo: { name: '⛪ Templo / palácio', hint: 'Templo de Aster, Salão do Trono', biome: 'planicie' },
  deserto: { name: "🏜 Guilda do deserto", hint: "Vel'Qadar, Sahrim", biome: 'deserto' },
  citadela: { name: '🔥 Citadela arruinada', hint: 'Valdoria depois do muro (Ato 5)', biome: 'planicie' },
  vazio: { name: '🌀 O Vazio', hint: 'O continente invertido (Atos 6–8)', biome: 'planicie' },
};

const SAFE = 3;

function tile(map: BattleMap, x: number, y: number): Tile | undefined {
  return inBounds(map, x, y) ? map.tiles[y * map.w + x] : undefined;
}

function fill(map: BattleMap, t: Terrain, h = 1): void {
  for (const tl of map.tiles) {
    tl.t = t;
    tl.h = h;
    tl.p = null;
  }
}

/** Caminho em L (rua, trilha) de uma ponta à outra, passando por y. */
function road(map: BattleMap, y: number, t: Terrain, width = 1): void {
  for (let x = 0; x < map.w; x++)
    for (let k = 0; k < width; k++) {
      const tl = tile(map, x, y + k);
      if (tl && TERRAIN[tl.t].walkable) {
        tl.t = t;
        tl.p = null;
      }
    }
}

/** Tenta carimbar estruturas em lugares livres (sem sobrepor), fora das colunas dos spawns. */
function scatterStructures(map: BattleMap, rng: Rng, id: StructureId, count: number, size: () => [number, number], avoid: (x: number, y: number) => boolean = () => false): void {
  const used = new Set<number>();
  for (let tries = 0; tries < count * 30 && count > 0; tries++) {
    const [w, h] = size();
    const x0 = rng.int(SAFE, Math.max(SAFE, map.w - SAFE - w));
    const y0 = rng.int(0, Math.max(0, map.h - h));
    let ok = true;
    for (let y = y0 - 1; y <= y0 + h && ok; y++)
      for (let x = x0 - 1; x <= x0 + w && ok; x++) if (used.has(y * map.w + x) || avoid(x, y)) ok = false;
    if (!ok) continue;
    stamp(map, id, x0, y0, w, h);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) used.add(y * map.w + x);
    count--;
  }
}

/** Espalha objetos em tiles livres e andáveis (chance por tile). */
function sprinkle(map: BattleMap, rng: Rng, props: Prop[], chance: number, where: (t: Tile, x: number, y: number) => boolean = () => true): void {
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = tile(map, x, y)!;
      if (t.p || !TERRAIN[t.t].walkable || t.door || t.up?.length || t.ladder || !where(t, x, y)) continue;
      if (rng.chance(chance)) t.p = rng.pick(props);
    }
}

/** Gera um cenário temático. */
export function generateTheme(theme: ThemeId, w: number, h: number, seed: number): BattleMap {
  const rng = new Rng(seed);
  const def = THEMES[theme];
  const map = createEmptyMap(w, h, def.biome, `${def.name.replace(/^\S+\s/, '')} ${seed % 1000}`);
  map.id = `tema_${theme}_${seed}`;
  const mid = Math.floor(h / 2);
  const onRoad = (y: number) => Math.abs(y - mid) <= 1;
  switch (theme) {
    case 'vila':
      fill(map, 'grama');
      for (const t of map.tiles) if (rng.chance(0.08)) t.h = 2;
      road(map, mid, 'terra', 2);
      scatterStructures(map, rng, 'casa_vila', 4, () => [rng.int(2, 3), rng.int(2, 3)], (_x, y) => onRoad(y) || y === mid + 1);
      sprinkle(map, rng, ['cerca', 'feno', 'barril', 'carroca', 'flores', 'arbusto'], 0.06, (t) => t.t === 'grama');
      sprinkle(map, rng, ['arvore', 'pinheiro'], 0.08, (_t, x, y) => y < 2 || y > h - 3 || x < 2 || x > w - 3);
      if (tile(map, Math.floor(w / 2), mid - 2) && !tile(map, Math.floor(w / 2), mid - 2)!.p) tile(map, Math.floor(w / 2), mid - 2)!.p = 'poco';
      break;
    case 'cidade':
      fill(map, 'paralelepipedo');
      road(map, mid, 'paralelepipedo', 2);
      stamp(map, 'praca', Math.floor(w / 2) - 2, mid - 2, 5, 5);
      scatterStructures(map, rng, 'casa_pedra', 5, () => [rng.int(2, 3), rng.int(2, 3)], (x, y) => onRoad(y) || (Math.abs(x - w / 2) < 4 && Math.abs(y - mid) < 4));
      sprinkle(map, rng, ['barril', 'caixa', 'lampiao', 'carroca', 'banco'], 0.04, (t) => t.t === 'paralelepipedo');
      break;
    case 'porto': {
      fill(map, 'paralelepipedo');
      const shore = Math.floor(h * 0.62);
      for (let y = shore; y < h; y++) for (let x = 0; x < w; x++) Object.assign(tile(map, x, y)!, { t: 'agua_funda', h: 0, p: null });
      // Píeres descendo para a água.
      for (let x = SAFE + 1; x < w - SAFE - 1; x += 4) stamp(map, 'ponte', x, shore, 2, h - shore);
      for (let x = 0; x < w; x++) Object.assign(tile(map, x, shore - 1)!, { t: 'madeira', p: null });
      scatterStructures(map, rng, 'casa_pedra', 3, () => [rng.int(2, 3), 2], (_x, y) => y >= shore - 3 || onRoad(y));
      sprinkle(map, rng, ['barril', 'caixa', 'caixa', 'lampiao'], 0.07, (t) => t.t === 'madeira' || t.t === 'paralelepipedo');
      break;
    }
    case 'caverna': {
      fill(map, 'caverna');
      // Autômato celular: paredes de rocha viva nas bordas e bolsões.
      let wall = map.tiles.map((_, i) => rng.chance(0.42) || i % w === 0 || i % w === w - 1);
      for (let it = 0; it < 4; it++)
        wall = wall.map((_, i) => {
          const x = i % w;
          const y = Math.floor(i / w);
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inBounds(map, x + dx, y + dy) || wall[(y + dy) * w + x + dx]) n++;
          return n >= 5;
        });
      map.tiles.forEach((t, i) => {
        const x = i % w;
        if (wall[i] && x >= SAFE && x < w - SAFE) {
          t.t = 'rocha_viva';
          t.h = 3 + (rng.chance(0.3) ? 1 : 0);
        } else t.h = 1;
      });
      road(map, mid, 'caverna');
      for (let x = 0; x < w; x++) tile(map, x, mid)!.h = 1;
      // Um bolsão de lava ou abismo e um veio de cristal.
      const px = rng.int(SAFE + 1, w - SAFE - 3);
      const py = rng.chance(0.5) ? rng.int(0, Math.max(0, mid - 3)) : rng.int(mid + 2, Math.max(mid + 2, h - 2));
      const pool: Terrain = rng.chance(0.5) ? 'lava' : 'abismo';
      for (let y = py; y < py + 2; y++) for (let x = px; x < px + 2; x++) if (tile(map, x, y) && tile(map, x, y)!.t === 'caverna') Object.assign(tile(map, x, y)!, { t: pool, h: 0 });
      sprinkle(map, rng, ['estalagmite', 'cristal', 'minerio', 'ossos', 'teia', 'cogumelos_brilho'], 0.07, (t, _x, y) => t.t === 'caverna' && y !== mid);
      break;
    }
    case 'templo': {
      fill(map, 'marmore');
      for (let x = 0; x < w; x++)
        for (const y of [0, h - 1]) Object.assign(tile(map, x, y)!, { t: 'muralha', h: 4 });
      road(map, mid, 'tapete');
      for (let x = SAFE; x < w - SAFE; x += 2)
        for (const y of [mid - 2, mid + 2]) if (tile(map, x, y)) tile(map, x, y)!.p = 'pilar';
      const ax = w - SAFE - 1;
      if (tile(map, ax, mid)) {
        tile(map, ax, mid)!.p = 'altar';
        tile(map, ax, mid)!.h = 2;
      }
      for (const y of [1, h - 2]) for (let x = SAFE; x < w - SAFE; x += 3) if (tile(map, x, y)) tile(map, x, y)!.p = rng.chance(0.5) ? 'estatua' : 'estandarte';
      sprinkle(map, rng, ['sarcofago', 'estante', 'lampiao'], 0.03, (t, _x, y) => t.t === 'marmore' && Math.abs(y - mid) > 3);
      break;
    }
    case 'deserto':
      fill(map, 'areia');
      for (const t of map.tiles) if (rng.chance(0.12)) t.h = 2;
      stamp(map, 'praca', Math.floor(w / 2) - 2, mid - 2, 5, 5);
      for (let y = mid - 2; y <= mid + 2; y++) for (let x = Math.floor(w / 2) - 2; x <= Math.floor(w / 2) + 2; x++) if (tile(map, x, y)) tile(map, x, y)!.t = 'arenito';
      scatterStructures(map, rng, 'casa_deserto', 4, () => [rng.int(2, 3), rng.int(2, 3)], (x, y) => onRoad(y) || (Math.abs(x - w / 2) < 4 && Math.abs(y - mid) < 4));
      sprinkle(map, rng, ['tenda', 'barril', 'caixa', 'cacto', 'banca'], 0.05, (t) => t.t === 'areia');
      break;
    case 'citadela':
      fill(map, 'paralelepipedo');
      for (const t of map.tiles) if (rng.chance(0.25)) t.t = 'cascalho';
      scatterStructures(map, rng, 'ruina', 3, () => [rng.int(3, 4), rng.int(3, 4)], (_x, y) => onRoad(y));
      for (const t of map.tiles) if (TERRAIN[t.t].walkable && !t.p && rng.chance(0.04)) {
        t.s = 'fogo';
        t.sTtl = 999;
      }
      sprinkle(map, rng, ['pilar_quebrado', 'carroca', 'ossos', 'estandarte'], 0.04);
      break;
    case 'vazio':
      fill(map, 'vazio');
      for (const t of map.tiles) {
        if (rng.chance(0.18)) t.t = 'carne';
        if (rng.chance(0.15)) t.h = rng.int(0, 3);
      }
      // Rachaduras de abismo (sem fechar o caminho do meio).
      for (let k = 0; k < 3; k++) {
        let x = rng.int(SAFE, w - SAFE - 1);
        let y = rng.int(0, h - 1);
        for (let s = 0; s < 6; s++) {
          if (tile(map, x, y) && Math.abs(y - mid) > 0) Object.assign(tile(map, x, y)!, { t: 'abismo', h: 0, p: null });
          x += rng.int(-1, 1);
          y += rng.int(-1, 1);
        }
      }
      sprinkle(map, rng, ['obelisco', 'cristal', 'ossos'], 0.04);
      if (tile(map, w - SAFE - 1, mid - 2)) tile(map, w - SAFE - 1, mid - 2)!.p = 'portal_vazio';
      break;
  }
  markSpawns(map);
  ensureConnected(map);
  return map;
}
