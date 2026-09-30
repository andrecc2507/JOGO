import { describe, expect, it } from 'vitest';
import { DataRegistry, SystemRegistry, World } from '@core';
import { registerGameData } from '@game/data';
import { SYSTEM_CATALOG } from '@game/systems/catalog';
import { spawnPlayer } from '@game/prefabs';
import { PlayerControlled, Transform } from '@game/components';

describe('conteúdo do jogo', () => {
  it('registra os dados sem ids duplicados', () => {
    const data = new DataRegistry();
    registerGameData(data);
    expect(data.get('actors', 'player').speed).toBeGreaterThan(0);
  });

  it('prefab do jogador monta os componentes esperados', () => {
    const data = new DataRegistry();
    registerGameData(data);
    const world = new World();
    const e = spawnPlayer(world, data, 10, 20);
    expect(world.get(e, Transform)).toEqual({ x: 10, y: 20 });
    expect(world.has(e, PlayerControlled)).toBe(true);
  });

  it('todos os sistemas do catálogo resolvem dependências sem ciclos', () => {
    const registry = SystemRegistry.fromCatalog(SYSTEM_CATALOG, Object.keys(SYSTEM_CATALOG));
    expect(() => registry.init({} as never)).not.toThrow();
  });
});
