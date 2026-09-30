import { describe, expect, it } from 'vitest';
import { SystemRegistry, type System, type SystemCatalog, type SystemContext } from '@core';

const sys = (id: string, extra: Partial<System> = {}): (() => System) => () => ({ id, ...extra });
const ctx = {} as SystemContext;

describe('SystemRegistry', () => {
  it('puxa dependências do catálogo e ordena por fase e dependência', () => {
    const catalog: SystemCatalog = {
      render: sys('render', { phase: 'late', dependsOn: ['movement'] }),
      movement: sys('movement', { phase: 'physics' }),
      ai: sys('ai', { dependsOn: ['perception'] }),
      perception: sys('perception'),
      control: sys('control', { phase: 'input' }),
    };
    const registry = SystemRegistry.fromCatalog(catalog, ['render', 'ai', 'control']);
    registry.init(ctx);
    expect(registry.order).toEqual(['control', 'perception', 'ai', 'movement', 'render']);
  });

  it('acusa sistema ausente no catálogo', () => {
    const catalog: SystemCatalog = { a: sys('a', { dependsOn: ['missing'] }) };
    expect(() => SystemRegistry.fromCatalog(catalog, ['a'])).toThrow(/missing.*exigido por "a"/);
  });

  it('acusa dependência de fase posterior', () => {
    const catalog: SystemCatalog = {
      control: sys('control', { phase: 'input', dependsOn: ['ai'] }),
      ai: sys('ai'),
    };
    const registry = SystemRegistry.fromCatalog(catalog, ['control']);
    expect(() => registry.init(ctx)).toThrow(/fase posterior/);
  });

  it('acusa dependência circular', () => {
    const catalog: SystemCatalog = {
      a: sys('a', { dependsOn: ['b'] }),
      b: sys('b', { dependsOn: ['a'] }),
    };
    const registry = SystemRegistry.fromCatalog(catalog, ['a']);
    expect(() => registry.init(ctx)).toThrow(/circular/);
  });

  it('serializa e restaura o estado dos sistemas', () => {
    let value = 0;
    const registry = new SystemRegistry().add({
      id: 'counter',
      serialize: () => ({ value: 42 }),
      deserialize: (s) => (value = (s as { value: number }).value),
    });
    registry.init(ctx);
    registry.deserialize(registry.serialize(ctx), ctx);
    expect(value).toBe(42);
  });
});
