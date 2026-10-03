import type { ClassId } from '../data';
import { outfitFor } from './outfits';
import { artFor, type SpriteArt } from './sprite_anims';

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
  /** Roupa da subclasse (`classe:subclasse`), ver render/outfits.ts. */
  outfit?: string;
  /** Pixel art própria (bestiário): substitui os modelos padrão. */
  sprite?: string[];
  palette?: Record<string, string>;
  /** Arte pronta (id em data/sprite_art.json): substitui a pixel art quando já carregou. */
  art?: string;
}

const cache = new Map<string, HTMLCanvasElement>();

function palette(spec: SpriteSpec): Record<string, string> {
  const outfit = outfitFor(spec.outfit);
  const color = outfit?.color ?? spec.color;
  return {
    H: spec.hairColor,
    S: spec.skin,
    E: '#1b1b24',
    C: color,
    D: outfit?.dark ?? spec.dark,
    A: outfit?.accent ?? '#ffd54f',
    B: outfit?.accent ?? '#6d4c2a',
    K: '#2d2018',
    M: '#b8c4cc',
    W: '#8a5a2b',
    G: '#4fe3ff',
    Y: '#ffd54f',
    L: '#e8e0d0',
    T: color,
    N: '#e0c0a0',
  };
}

/**
 * Imagens prontas (ex.: geradas no Ludo.ai), carregadas uma vez. Enquanto não chegam, a unidade usa
 * a pixel art. Ver render/sprite_anims.ts para o formato.
 */
const images = new Map<string, HTMLImageElement>();

export function loadSpriteImage(path: string): HTMLImageElement {
  let img = images.get(path);
  if (!img) {
    img = new Image();
    // Imagem convertida agora pelo importador (data:) ou arquivo do projeto.
    img.src = path.startsWith('data:') || path.startsWith('blob:') ? path : import.meta.env.BASE_URL + path;
    images.set(path, img);
  }
  return img;
}

/** Pré-carrega as imagens (chamado no início do jogo). */
export function preloadSpriteImages(paths: Iterable<string>): void {
  for (const p of paths) loadSpriteImage(p);
}

/** Recorta o quadro `frame` de uma tira de `frames` quadros (com 1 pixel de margem, como a pixel art). */
export function imageFrame(path: string, frame = 0, frames = 1): HTMLCanvasElement | null {
  const img = loadSpriteImage(path);
  if (!img.complete || !img.naturalWidth) return null;
  const key = `img:${path}#${frame}/${frames}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const fw = Math.floor(img.naturalWidth / frames);
  const canvas = document.createElement('canvas');
  canvas.width = fw + 2;
  canvas.height = img.naturalHeight + 2;
  canvas.getContext('2d')!.drawImage(img, frame * fw, 0, fw, img.naturalHeight, 1, 1, fw, img.naturalHeight);
  cache.set(key, canvas);
  return canvas;
}

/** Imagem parada da arte: `base` ou o 1º quadro de `idle`. */
function artStill(art: SpriteArt): HTMLCanvasElement | null {
  if (art.base) return imageFrame(art.base);
  const idle = art.clips.idle;
  return idle ? imageFrame(idle.sheet, 0, idle.frames) : null;
}

export function spriteFor(spec: SpriteSpec): HTMLCanvasElement {
  const art = artFor(spec.art);
  if (art) {
    const img = artStill(art);
    if (img) return img;
  }
  const key = JSON.stringify({ ...spec, art: undefined });
  const hit = cache.get(key);
  if (hit) return hit;
  let rows: string[];
  const extra: [number, number, string][] = [];
  if (spec.sprite?.length) rows = [...spec.sprite];
  else if (spec.beast) rows = [...BEAST];
  else {
    rows = [...BODY];
    const hair = HAIR[spec.hairStyle % HAIR.length]!;
    hair.forEach((r, i) => (rows[i] = r));
    const hat = outfitFor(spec.outfit)?.hat ?? HATS[spec.classId];
    if (hat) hat.forEach((r, i) => (rows[i] = mergeRow(rows[i]!, r)));
    extra.push(...(WEAPONS[spec.classId] ?? []));
  }
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const pal = { ...palette(spec), ...(spec.palette ?? {}) };
  const grid: (string | null)[][] = rows.map((r) => [...r.padEnd(w, '.')].map((ch) => (ch === '.' ? null : pal[ch] ?? null)));
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
  drawCanvas(ctx, spriteFor(spec), x, y, scale, flip);
}

/** Desenha um quadro já pronto com a base (pés) em (x, y). */
export function drawCanvas(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, scale: number, flip: boolean): void {
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}

/**
 * Retrato para a linha do tempo: recorta a cabeça (humanoides) ou o corpo inteiro (criaturas)
 * e amplia em pixel art dentro de um quadro quadrado.
 */
export function portraitCanvas(spec: SpriteSpec, size = 28): HTMLCanvasElement {
  const img = spriteFor(spec);
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  cv.className = 'portrait';
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const humanoid = !artFor(spec.art) && !spec.sprite?.length && !spec.beast;
  const sw = humanoid ? 10 : img.width;
  const sh = humanoid ? 9 : img.height;
  const sx = humanoid ? 1 : 0;
  const scale = Math.max(1, Math.floor(size / Math.max(sw, sh)));
  const dw = sw * scale;
  const dh = sh * scale;
  g.drawImage(img, sx, 0, sw, sh, Math.floor((size - dw) / 2), Math.floor((size - dh) / 2), dw, dh);
  return cv;
}
