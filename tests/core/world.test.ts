import { describe, expect, it } from 'vitest';
import { World, defineComponent } from '@core';

const Pos = defineComponent<{ x: number }>('test.Pos');
const Tag = defineComponent<{ name: string }>('test.Tag');

describe('World', () => {
  it('consulta entidades que têm todos os componentes', () => {
    const w = new World();
    const a = w.spawn();
    const b = w.spawn();
    w.add(a, Pos, { x: 1 }).add(a, Tag, { name: 'a' });
    w.add(b, Pos, { x: 2 });

    const result = w.query(Pos, Tag);
    expect(result).toHaveLength(1);
    const [entity, pos, tag] = result[0]!;
    expect(entity).toBe(a);
    expect(pos.x).toBe(1);
    expect(tag.name).toBe('a');
  });

  it('adia a remoção até flush()', () => {
    const w = new World();
    const e = w.spawn();
    w.add(e, Pos, { x: 0 });
    w.destroy(e);
    expect(w.isAlive(e)).toBe(false);
    expect(w.query(Pos)).toHaveLength(0);
    expect(w.entityCount).toBe(1);
    w.flush();
    expect(w.entityCount).toBe(0);
    expect(w.has(e, Pos)).toBe(false);
  });

  it('rejeita componentes com nome duplicado', () => {
    expect(() => defineComponent('test.Pos')).toThrow(/duplicado/);
  });
});
