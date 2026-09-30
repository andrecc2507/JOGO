import { describe, expect, it } from 'vitest';
import { MemoryStorage, SaveService } from '@core';

describe('SaveService', () => {
  it('salva e carrega', () => {
    const save = new SaveService(new MemoryStorage(), 1);
    save.save('slot', { gold: 10 });
    expect(save.has('slot')).toBe(true);
    expect(save.load('slot')).toEqual({ gold: 10 });
  });

  it('aplica migrações em sequência', () => {
    const storage = new MemoryStorage();
    new SaveService(storage, 1).save('slot', { gold: 10 });
    const v3 = new SaveService(storage, 3, {
      1: (d) => ({ ...d, gems: 0 }),
      2: (d) => ({ coins: d.gold, gems: d.gems }),
    });
    expect(v3.load('slot')).toEqual({ coins: 10, gems: 0 });
  });
});
