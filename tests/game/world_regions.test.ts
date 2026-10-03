import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, DISTANT_CREATURES } from '@game/data';
import { mapConnected, generateMap } from '@game/mapgen/generator';
import { newCampaign, travelHours } from '@game/world/campaign';
import { beastsOf, planEncounter, regionFloor } from '@game/world/encounters';
import { node, nodeOpen, places, shortestPath } from '@game/world/layout';
import { province, provinces } from '@game/world/provinces';
import { DISTANT, REGION_IDS, TRANSITIONS, isDistant, type Distant } from '@game/world/regions';
import { ensureWorld, estimate, reveal } from '@game/world/territory';

const days = (a: string, b: string, offroad = false) => travelHours([a, ...shortestPath(a, b, { offroad })], offroad) / 24;

describe('mapa ampliado: distâncias e terreno (C1–C3)', () => {
  it('capitais a 3–5 dias da Citadela; terras distantes a 7–12', () => {
    for (const cap of places().filter((n) => n.type === 'capital')) {
      const d = days('citadela', cap.id);
      expect(d, cap.id).toBeGreaterThanOrEqual(3);
      expect(d, cap.id).toBeLessThanOrEqual(5);
    }
    for (const rid of Object.keys(DISTANT) as Distant[]) {
      const d = days('citadela', `${rid}_vila`);
      expect(d, rid).toBeGreaterThanOrEqual(6);
      expect(d, rid).toBeLessThanOrEqual(12);
    }
  });

  it('fora da estrada é mais lento', () => {
    expect(days('citadela', 'magos_capital', true)).toBeGreaterThan(days('citadela', 'magos_capital'));
  });

  it('cidades de fronteira viram transição entre os dois biomas vizinhos', () => {
    expect(node('arqueiros_c3').region).toBe('taiga');
    expect(node('magos_c0').region).toBe('taiga');
    expect(node('clerigos_c3').region).toBe('charneca');
    const used = new Set(places().map((n) => n.region));
    for (const t of Object.keys(TRANSITIONS)) expect(used.has(t as never), t).toBe(true);
  });

  it('o continente e a Terra Morta só abrem nos capítulos certos', () => {
    const open = (ch: number) => (n: Parameters<typeof nodeOpen>[0]) => nodeOpen(n, ch);
    expect(shortestPath('citadela', 'continente_porto', { open: open(2) })).toEqual([]);
    expect(shortestPath('citadela', 'continente_porto', { open: open(6) }).length).toBeGreaterThan(0);
    expect(shortestPath('citadela', 'terra_morta_vila', { open: open(3) })).toEqual([]);
  });
});

describe('províncias e névoa (C1, C8)', () => {
  it('uma província por lugar, vizinhança simétrica', () => {
    expect(provinces().length).toBe(places().length);
    for (const p of provinces()) for (const nb of p.neighbors) expect(province(nb)!.neighbors, `${p.id}↔${nb}`).toContain(p.id);
  });

  it('o reino começa conhecido; as terras distantes, não. Chegar revela a província e as vizinhas', () => {
    const c = newCampaign(1);
    const w = ensureWorld(c);
    expect(w.provinces.magos_capital!.known).toBe(true);
    expect(w.provinces.geleira_vila!.known).toBe(false);
    const found = reveal(c, 'geleira_vila');
    expect(found).toContain('geleira_vila');
    expect(w.provinces.geleira_covil!.known).toBe(true);
    expect(w.provinces.geleira_vila!.seenAt).toBe(c.hours);
  });

  it('a estimativa fica larga com informação velha', () => {
    const c = newCampaign(1);
    reveal(c, 'magos_capital');
    const fresh = estimate(c, 'magos_capital', 10);
    c.hours += 24 * 30;
    const old = estimate(c, 'magos_capital', 10);
    expect(old[1] - old[0]).toBeGreaterThan(fresh[1] - fresh[0]);
  });
});

describe('regiões: criaturas, encontros e mapas (C4, C5)', () => {
  it('cada bioma distante tem 7 criaturas (3 comuns, 2 mágicas, 1 épica, 1 lendária) e cada transição 2', () => {
    for (const rid of Object.keys(DISTANT)) {
      const list = DISTANT_CREATURES.filter((c) => c.regions?.includes(rid));
      expect(list.map((c) => c.rarity).sort(), rid).toEqual(['comum', 'comum', 'comum', 'epico', 'lendario', 'raro', 'raro']);
    }
    for (const t of Object.keys(TRANSITIONS)) expect(DISTANT_CREATURES.filter((c) => c.regions?.includes(t)).length, t).toBe(2);
    for (const c of DISTANT_CREATURES) expect(DB.enemies[c.id], c.id).toBeDefined();
  });

  it('transição mistura as feras dos dois biomas com as próprias; bioma distante usa as suas e tem nível mínimo', () => {
    const taiga = beastsOf('taiga', 'comum', 20).map((e) => e.id);
    expect(taiga).toContain('lobo_da_taiga');
    expect(taiga.some((id) => DB.enemies[id]!.biomes !== 'all' && (DB.enemies[id]!.biomes as string[]).includes('floresta'))).toBe(true);
    expect(taiga.some((id) => DB.enemies[id]!.biomes !== 'all' && (DB.enemies[id]!.biomes as string[]).includes('neve'))).toBe(true);
    expect(beastsOf('vulcao', 'comum', 40).every((e) => e.regions?.includes('vulcao'))).toBe(true);
    expect(regionFloor('vulcao')).toBeGreaterThanOrEqual(20);
    const plan = planEncounter(new Rng(3), 'geleira', 5, 'comum', { beastsOnly: true });
    expect(plan.level).toBeGreaterThanOrEqual(regionFloor('geleira'));
  });

  it('toda região gera mapa de batalha conectado e com spawns', () => {
    for (const r of REGION_IDS) {
      const map = generateMap({ biome: r, seed: 11 });
      const a = map.tiles.findIndex((t) => t.spawn === 'player');
      const b = map.tiles.findIndex((t) => t.spawn === 'enemy');
      expect(a, r).toBeGreaterThanOrEqual(0);
      expect(b, r).toBeGreaterThanOrEqual(0);
      expect(mapConnected(map, a, b), r).toBe(true);
      if (isDistant(r)) expect(map.name).toContain(DISTANT[r].label);
    }
  });
});
