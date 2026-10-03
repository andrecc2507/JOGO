import { describe, expect, it } from 'vitest';
import { Rng } from '@core';
import { DB, DROP_DEFAULTS, MATERIAL_FAMILIES, REPO_CREATURES, REPO_MATERIALS } from '@game/data';
import { defaultDrops, expectedValue, materialSources, rollDrops } from '@game/rules/drops';

describe('materiais e drops', () => {
  it('toda fera (menos invocações) tem tabela com materiais que existem; joias começam "a definir"', () => {
    const ids = new Set(REPO_MATERIALS.map((m) => m.id));
    for (const c of REPO_CREATURES) {
      if (c.summonOnly) {
        expect(c.drops, c.id).toBeUndefined();
        continue;
      }
      expect(c.drops, c.id).toBeDefined();
      expect(MATERIAL_FAMILIES.some((f) => f.id === c.drops!.family), c.id).toBe(true);
      for (const e of c.drops!.table) {
        expect(ids.has(e.material), `${c.id}: ${e.material}`).toBe(true);
        expect(e.chance).toBeGreaterThan(0);
        expect(e.chance).toBeLessThanOrEqual(1);
        expect(e.min).toBeLessThanOrEqual(e.max);
      }
      expect(['indefinida', 'habilidade', 'forja']).toContain(c.drops!.jewel.type);
    }
  });

  it('padrão por raridade segue o design (troféu só épica/lendária, joia rara)', () => {
    const d = defaultDrops('lendario', 'fogo', 'draconico');
    expect(d.trophy).toBe(true);
    expect(d.table.map((e) => e.material)).toEqual(['escama_de_dragao', 'sangue_de_dragao', 'cinza_ardente']);
    expect(d.jewel.chance).toBe(DROP_DEFAULTS.lendario.jewel);
    expect(defaultDrops('comum', 'neutro', 'roedor').table).toHaveLength(2);
    expect(defaultDrops('comum', 'neutro', 'roedor').trophy).toBe(false);
  });

  it('glândula de veneno vem de serpentes e aracnídeos', () => {
    const fams = new Set(materialSources('glandula_de_veneno', REPO_CREATURES).map((s) => s.creature.drops!.family));
    expect(fams).toEqual(new Set(['serpente', 'aracnideo']));
  });

  it('sorteio respeita chances e quantidades (média perto do esperado)', () => {
    const drops = defaultDrops('comum', 'neutro', 'roedor');
    const rng = new Rng(42);
    let common = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const r = rollDrops(drops, rng);
      const n = r.materials.pelagem_macia ?? 0;
      expect(n === 0 || (n >= 1 && n <= 2)).toBe(true);
      common += n;
    }
    // 75% × média 1,5 = 1,125 por abate.
    expect(common / N).toBeGreaterThan(1.05);
    expect(common / N).toBeLessThan(1.2);
    expect(rollDrops(undefined, rng)).toEqual({ materials: {}, trophy: false, jewel: false });
  });

  it('valor esperado cresce com a raridade', () => {
    const v = (['comum', 'raro', 'epico', 'lendario'] as const).map((r) => expectedValue(defaultDrops(r, 'gelo', 'canideo')));
    for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThan(v[i - 1]!);
    expect(DB.materials.presa?.price).toBe(25);
  });
});
