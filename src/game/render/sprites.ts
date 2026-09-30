import type { ClassId } from '../data';

/**
 * Pixel art gerada por código: cada sprite é uma matriz de letras mapeadas numa paleta.
 * Um contorno escuro é adicionado automaticamente para leitura clara no mapa.
 */

const BODY = [
  '............',
  '....HHHH....',
  '...HHHHHH...',
  '...HSSSSH...',
  '...SESSES...',
  '...SSSSSS...',
  '....SSSS....',
  '...CCCCCC...',
  '..CCCCCCCC..',
  '..SCCCCCCS..',
  '..SCCCCCCS..',
  '...CCBBCC...',
  '...DDDDDD...',
  '...DD..DD...',
  '...DD..DD...',
  '...KK..KK...',
];

/** Variações de cabelo aplicadas por cima do corpo (linhas 0–4). */
const HAIR: string[][] = [
  ['............', '....HHHH....', '...HHHHHH...', '...HSSSSH...', '...SESSES...'],
  ['............', '...HHHHHH...', '..HHHHHHHH..', '..HHSSSSHH..', '..HSESSESH..'],
  ['.....HH.....', '...HHHHHH...', '..HHHHHHHH..', '...HSSSSH...', '...SESSES...'],
  ['............', '....HHHH....', '...HHHHHH...', '..HHSSSSHH..', '..HSESSESH..'],
];

/** Chapéus / elmos por classe (sobrepõem as primeiras linhas). */
const HATS: Partial<Record<ClassId, string[]>> = {
  mago: ['.....TT.....', '....TTTT....', '...TTTTTT...', '..TTTTTTTT..'],
  guerreiro: ['............', '....MMMM....', '...MMMMMM...', '...MSSSSM...'],
  clerigo: ['....TTTT....', '...TTTTTT...', '..TTTTTTTT..', '..TTSSSSTT..'],
  ladrao: ['............', '............', '...DDDDDD...', '...DSSSSD...'],
  arqueiro: ['............', '....TTTT....', '...TTTTTTT..', '...HSSSSH...'],
};

const WEAPONS: Partial<Record<ClassId, [number, number, string][]>> = {
  guerreiro: [[10, 5, 'M'], [10, 6, 'M'], [10, 7, 'M'], [10, 8, 'M'], [9, 9, 'W'], [10, 9, 'W'], [11, 9, 'W'], [10, 10, 'W']],
  arqueiro: [[10, 4, 'W'], [11, 5, 'W'], [11, 6, 'W'], [11, 7, 'W'], [11, 8, 'W'], [11, 9, 'W'], [10, 10, 'W'], [10, 5, 'L'], [10, 6, 'L'], [10, 7, 'L'], [10, 8, 'L'], [10, 9, 'L']],
  mago: [[10, 3, 'G'], [10, 4, 'W'], [10, 5, 'W'], [10, 6, 'W'], [10, 7, 'W'], [10, 8, 'W'], [10, 9, 'W'], [10, 10, 'W'], [10, 11, 'W']],
  clerigo: [[10, 3, 'Y'], [9, 4, 'Y'], [11, 4, 'Y'], [10, 4, 'W'], [10, 5, 'W'], [10, 6, 'W'], [10, 7, 'W'], [10, 8, 'W'], [10, 9, 'W'], [10, 10, 'W']],
  ladrao: [[10, 8, 'M'], [10, 9, 'M'], [10, 10, 'W']],
  aprendiz: [[10, 8, 'M'], [10, 9, 'M'], [10, 10, 'W']],
};

const BEAST = [
  '................',
  '..........HH....',
  '.........HCCC...',
  '........CCECCN..',
  '..C....CCCCCC...',
  '..CCCCCCCCCC....',
  '.CCCCCCCCCCC....',
  '.CCCCCCCCCCC....',
  '..DD.DD..DD.DD..',
  '..DD.DD..DD.DD..',
  '..KK.KK..KK.KK..',
];

export interface SpriteSpec {
  classId: ClassId;
  beast: boolean;
  color: string;
  dark: string;
  hairColor: string;
  hairStyle: number;
  skin: string;
}

const cache = new Map<string, HTMLCanvasElement>();

function palette(spec: SpriteSpec): Record<string, string> {
  return {
    H: spec.hairColor,
    S: spec.skin,
    E: '#1b1b24',
    C: spec.color,
    D: spec.dark,
    B: '#6d4c2a',
    K: '#2d2018',
    M: '#b8c4cc',
    W: '#8a5a2b',
    G: '#4fe3ff',
    Y: '#ffd54f',
    L: '#e8e0d0',
    T: spec.color,
    N: '#e0c0a0',
  };
}

export function spriteFor(spec: SpriteSpec): HTMLCanvasElement {
  const key = JSON.stringify(spec);
  const hit = cache.get(key);
  if (hit) return hit;
  let rows: string[];
  const extra: [number, number, string][] = [];
  if (spec.beast) rows = [...BEAST];
  else {
    rows = [...BODY];
    const hair = HAIR[spec.hairStyle % HAIR.length]!;
    hair.forEach((r, i) => (rows[i] = r));
    const hat = HATS[spec.classId];
    if (hat) hat.forEach((r, i) => (rows[i] = mergeRow(rows[i]!, r)));
    extra.push(...(WEAPONS[spec.classId] ?? []));
  }
  const w = rows[0]!.length;
  const h = rows.length;
  const pal = palette(spec);
  const grid: (string | null)[][] = rows.map((r) => [...r].map((ch) => (ch === '.' ? null : pal[ch] ?? null)));
  for (const [x, y, ch] of extra) if (grid[y]) grid[y]![x] = pal[ch] ?? null;
  const canvas = document.createElement('canvas');
  canvas.width = w + 2;
  canvas.height = h + 2;
  const ctx = canvas.getContext('2d')!;
  // Contorno.
  ctx.fillStyle = '#140e0a';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!grid[y]![x]) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        ctx.fillRect(x + 1 + dx!, y + 1 + dy!, 1, 1);
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = grid[y]![x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  cache.set(key, canvas);
  return canvas;
}

function mergeRow(base: string, over: string): string {
  return [...base].map((ch, i) => (over[i] && over[i] !== '.' ? over[i]! : ch)).join('');
}

/** Desenha o sprite com a base (pés) em (x, y). */
export function drawSprite(ctx: CanvasRenderingContext2D, spec: SpriteSpec, x: number, y: number, scale: number, flip: boolean): void {
  const img = spriteFor(spec);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}
