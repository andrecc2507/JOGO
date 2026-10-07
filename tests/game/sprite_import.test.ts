import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { backgroundMask, colorCount, flipH, idFromFileName, importSprite, artFile, joinFrames, splitPoseSheet, type Rgba } from '@game/render/sprite_import';
import { mergeArtSlot, artFor } from '@game/render/sprite_anims';
import { spriteDevServer } from '../../tools/sprite_dev_server';

/**
 * Arte 4×6 conhecida, ampliada 20× sobre fundo quase preto com ruído (como as imagens geradas).
 * O "olho" (preto puro) fica dentro do desenho e não pode virar fundo.
 */
const ART = ['.GG.', 'GEGG', 'GGGG', 'BBBB', 'BBBB', 'K..K'];
const COLOR: Record<string, [number, number, number]> = { G: [120, 180, 60], E: [0, 0, 0], B: [220, 190, 150], K: [70, 50, 40] };

function generated(scale = 20, margin = 30, noise = 3): Rgba {
  const w = ART[0]!.length * scale + margin * 2;
  const h = ART.length * scale + margin * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * noise;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ax = Math.floor((x - margin) / scale);
      const ay = Math.floor((y - margin) / scale);
      const ch = ART[ay]?.[ax];
      const c = ch && ch !== '.' ? COLOR[ch]! : [2, 2, 3];
      const i = (y * w + x) * 4;
      data[i] = c[0]! + rnd();
      data[i + 1] = c[1]! + rnd();
      data[i + 2] = c[2]! + rnd();
      data[i + 3] = 255;
    }
  return { width: w, height: h, data };
}

function at(img: Rgba, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

describe('importador de sprites', () => {
  it('reconstrói a pixel art: tamanho, fundo transparente, olho preto preservado', () => {
    const { frames } = importSprite([generated()], { height: 6, colors: 0 });
    const f = frames[0]!;
    expect([f.width, f.height]).toEqual([4, 6]);
    ART.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const p = at(f, x, y);
        if (ch === '.') expect(p[3], `${x},${y}`).toBe(0);
        else {
          expect(p[3], `${x},${y}`).toBe(255);
          expect(Math.abs(p[0]! - COLOR[ch]![0]), `${x},${y}`).toBeLessThan(8);
        }
      }),
    );
  });

  it('o fundo é só o que encosta na borda', () => {
    const img = generated();
    const mask = backgroundMask(img, 28);
    // Pixel do olho (preto) fica dentro do desenho.
    const ex = 30 + 1 * 20 + 10;
    const ey = 30 + 1 * 20 + 10;
    expect(mask[ey * img.width + ex]).toBe(0);
    expect(mask[0]).toBe(1);
  });

  it('reduz a paleta, espelha e alinha quadros de animação pelo mesmo enquadramento', () => {
    const big = importSprite([generated()], { height: 12, colors: 3 });
    expect(colorCount(big.sheet)).toBeLessThanOrEqual(3);
    const f = importSprite([generated()], { height: 6, colors: 0 }).frames[0]!;
    expect(at(flipH(f), 0, 1)).toEqual(at(f, 3, 1));
    const anim = importSprite([generated(), generated(20, 40)], { height: 6, colors: 0 });
    expect(anim.frames).toHaveLength(2);
    expect(anim.sheet.width).toBe(anim.frames[0]!.width * 2);
  });

  it('folha de poses: separa as figuras lado a lado (e em linhas) na ordem de leitura', () => {
    const row = joinFrames([generated(), generated(), generated()]);
    const sheet = joinFrames([row]);
    const cells = splitPoseSheet(sheet);
    expect(cells).toHaveLength(3);
    const { frames } = importSprite(cells, { height: 6, colors: 0 });
    expect(frames.every((f) => f.width === 4 && f.height === 6)).toBe(true);
    // Duas linhas de duas figuras.
    const two = joinFrames([generated(), generated()]);
    const grid: Rgba = { width: two.width, height: two.height * 2, data: new Uint8ClampedArray(two.data.length * 2) };
    grid.data.set(two.data, 0);
    grid.data.set(two.data, two.data.length);
    expect(splitPoseSheet(grid)).toHaveLength(4);
  });

  it('erro claro quando tudo vira fundo', () => {
    const empty: Rgba = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(0) };
    expect(() => importSprite([empty])).toThrow(/vazia/);
  });

  it('nomes de arquivo viram ids de criatura e caminhos do manifesto', () => {
    expect(idFromFileName('Urso Chifre (2).png')).toBe('urso_chifre');
    expect(idFromFileName('Cão-de-Corte.PNG')).toBe('cao_de_corte');
    expect(artFile('urso_chifre', 'base')).toBe('assets/sprites/criaturas/urso_chifre.png');
    expect(artFile('urso_chifre', 'skill:investida')).toBe('assets/sprites/criaturas/urso_chifre/skill_investida.png');
  });

  it('arte registrada em tempo de execução passa a valer para a criatura', () => {
    mergeArtSlot('cervo_da_folha', 'base', 'data:image/png;base64,AAAA', 1);
    mergeArtSlot('cervo_da_folha', 'idle', 'data:image/png;base64,BBBB', 4, 6);
    const art = artFor('cervo_da_folha')!;
    expect(art.base).toContain('AAAA');
    expect(art.clips.idle?.frames).toBe(4);
  });
});

describe('servidor de desenvolvimento: gravar sprite no projeto', () => {
  it('grava o PNG em public/ e a entrada em sprite_art.json', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jogo-'));
    mkdirSync(join(root, 'src/game/data'), { recursive: true });
    writeFileSync(join(root, 'src/game/data/sprite_art.json'), '{}');
    let handler: ((req: EventEmitter & { method: string }, res: Record<string, unknown>) => void) | null = null;
    const plugin = spriteDevServer(root);
    (plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (_p: string, fn: typeof handler) => (handler = fn) } });
    const call = (method: string, body?: unknown) =>
      new Promise<{ code: number; json: Record<string, unknown> }>((resolve) => {
        const req = Object.assign(new EventEmitter(), { method });
        const res: Record<string, unknown> = {
          statusCode: 200,
          setHeader: () => undefined,
          end: (s: string) => resolve({ code: res.statusCode as number, json: JSON.parse(s) as Record<string, unknown> }),
        };
        handler!(req, res);
        if (body) req.emit('data', JSON.stringify(body));
        req.emit('end');
      });
    expect((await call('GET')).json.ok).toBe(true);
    const png = Buffer.from('fake').toString('base64');
    expect((await call('POST', { id: 'urso_chifre', slot: 'base', frames: 1, png })).json.ok).toBe(true);
    expect((await call('POST', { id: 'urso_chifre', slot: 'idle', frames: 4, fps: 6, png })).json.ok).toBe(true);
    expect((await call('POST', { id: '../hack', slot: 'base', frames: 1, png })).code).toBe(400);
    expect(existsSync(join(root, 'public/assets/sprites/criaturas/urso_chifre.png'))).toBe(true);
    expect(existsSync(join(root, 'public/assets/sprites/criaturas/urso_chifre/idle.png'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(root, 'src/game/data/sprite_art.json'), 'utf8'));
    expect(manifest.urso_chifre).toEqual({ anims: { idle: { frames: 4, fps: 6 } }, base: 'assets/sprites/criaturas/urso_chifre.png' });
  });
});
