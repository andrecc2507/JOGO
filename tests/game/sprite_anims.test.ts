import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { Rng } from '@core';
import { DB } from '@game/data';
import { unitFromEnemy } from '@game/battle/units';
import { allArtFiles, artFor, frameIndex, parseArt, pickClip, poseChain, resolvePose } from '@game/render/sprite_anims';

describe('arte pronta e animações', () => {
  it('lê a ficha: atalho de quadros, pasta padrão e skill:x → skill_x.png', () => {
    const art = parseArt('urso', { base: 'b.png', anims: { idle: 4, 'skill:garra': { frames: 6, fps: 20 }, dead: { sheet: 'x/morte.png', frames: 5 } } });
    expect(art.clips.idle).toEqual({ sheet: 'assets/sprites/criaturas/urso/idle.png', frames: 4, fps: 6, loop: true });
    expect(art.clips['skill:garra']).toEqual({ sheet: 'assets/sprites/criaturas/urso/skill_garra.png', frames: 6, fps: 20, loop: false });
    expect(art.clips.dead!.sheet).toBe('x/morte.png');
    expect(parseArt('lobo', 'lobo.png')).toEqual({ id: 'lobo', base: 'lobo.png', clips: {} });
  });

  it('animação que falta cai para a mais próxima', () => {
    expect(poseChain({ pose: 'jump' })).toEqual(['jump', 'move', 'idle']);
    expect(poseChain({ pose: 'dead' })).toEqual(['dead', 'fallen', 'idle']);
    expect(poseChain({ pose: 'cast', skill: 'raio' })).toEqual(['skill:raio', 'cast', 'attack', 'idle']);
    const art = parseArt('u', { anims: { idle: 2, attack: 3 } });
    expect(pickClip(art, { pose: 'attack', skill: 'garra' })!.name).toBe('attack');
    expect(pickClip(art, { pose: 'hurt' })!.name).toBe('idle');
    expect(pickClip(parseArt('v', 'v.png'), { pose: 'idle' })).toBeNull();
  });

  it('quadros: repete em laço ou segura o último', () => {
    const loop = { sheet: '', frames: 4, fps: 10, loop: true };
    expect([0, 0.1, 0.35, 0.4].map((t) => frameIndex(loop, t))).toEqual([0, 1, 3, 0]);
    expect(frameIndex({ ...loop, loop: false }, 5)).toBe(3);
  });

  it('pose pelo estado: morto > habilidade > dano > movimento > caído > parado', () => {
    const u = { alive: true, statuses: {} as Record<string, unknown> };
    expect(resolvePose(u).pose).toBe('idle');
    expect(resolvePose({ ...u, statuses: { derrubado: 1 } }).pose).toBe('fallen');
    expect(resolvePose({ ...u, statuses: { derrubado: 1 } }, { motion: 'jump' }).pose).toBe('jump');
    expect(resolvePose(u, { motion: 'move', hurtAge: 0.1 }).pose).toBe('hurt');
    expect(resolvePose(u, { hurtAge: 2 }).pose).toBe('idle');
    expect(resolvePose(u, { hurtAge: 0, acting: { skill: 'raio', magic: true } })).toEqual({ pose: 'cast', skill: 'raio' });
    expect(resolvePose({ ...u, alive: false }, { acting: { skill: 'x', magic: false } }).pose).toBe('dead');
  });

  it('manifesto: arquivos existem em public/ e o Urso-Chifre usa a arte', () => {
    for (const f of allArtFiles()) expect(existsSync(`public/${f}`), f).toBe(true);
    expect(artFor('urso_chifre')?.base).toBeDefined();
    expect(unitFromEnemy(DB.enemies.urso_chifre!, 10, new Rng(1)).look.art).toBe('urso_chifre');
    expect(unitFromEnemy(DB.enemies.lobo_da_silvia!, 10, new Rng(1)).look.art).toBeUndefined();
  });
});
