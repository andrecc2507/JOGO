/**
 * Importação de sprites gerados (Ludo.ai, Stable Diffusion…): converte a imagem grande, com fundo
 * liso e "pixels" desenhados à mão pela IA (fora de grade), em pixel art 1:1 do jogo — fundo
 * transparente, recortada, pés na borda de baixo e paleta limpa. Módulo puro (sem DOM): recebe e
 * devolve RGBA cru, para servir ao importador do Bestiário e aos testes. Ver docs/design/sprites.md.
 */

export interface Rgba {
  width: number;
  height: number;
  /** RGBA, 4 bytes por pixel, linha a linha. */
  data: Uint8ClampedArray;
}

export interface ImportOptions {
  /** Altura final em pixels de arte (a largura segue a proporção). */
  height: number;
  /** Diferença máxima (0–255 por canal) para um pixel contar como fundo. */
  tolerance: number;
  /** Máximo de cores na paleta final (0 = sem reduzir). */
  colors: number;
  /** Espelhar (o jogo espera a arte olhando para a direita). */
  flip: boolean;
  /** Margem transparente em volta (pixels de arte). */
  pad: number;
}

export const DEFAULT_IMPORT: ImportOptions = { height: 48, tolerance: 28, colors: 24, flip: false, pad: 0 };
/** Limites do importador. */
export const IMPORT_LIMITS = { minHeight: 16, maxHeight: 128, maxColors: 64 } as const;

export function blank(width: number, height: number): Rgba {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Cor de fundo: a mais comum entre as quatro bordas (ignora pixels já transparentes). */
export function backgroundColor(img: Rgba): [number, number, number] | null {
  const votes = new Map<number, { n: number; c: [number, number, number] }>();
  const add = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    if (img.data[i + 3]! < 128) return;
    const c: [number, number, number] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
    const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    const v = votes.get(key) ?? { n: 0, c };
    v.n++;
    votes.set(key, v);
  };
  for (let x = 0; x < img.width; x++) {
    add(x, 0);
    add(x, img.height - 1);
  }
  for (let y = 0; y < img.height; y++) {
    add(0, y);
    add(img.width - 1, y);
  }
  let best: { n: number; c: [number, number, number] } | null = null;
  for (const v of votes.values()) if (!best || v.n > best.n) best = v;
  return best?.c ?? null;
}

/**
 * Máscara de fundo: preenche a partir das bordas tudo que for transparente ou parecido com a cor
 * de fundo. Só o que está ligado à borda some (o preto dos olhos e do nariz fica).
 */
export function backgroundMask(img: Rgba, tolerance: number): Uint8Array {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  const bg = backgroundColor(img);
  const isBg = (p: number) => {
    const i = p * 4;
    if (data[i + 3]! < 128) return true;
    if (!bg) return false;
    return Math.abs(data[i]! - bg[0]) <= tolerance && Math.abs(data[i + 1]! - bg[1]) <= tolerance && Math.abs(data[i + 2]! - bg[2]) <= tolerance;
  };
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (mask[p] || !isBg(p)) continue;
    mask[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
  return mask;
}

/** Caixa do que não é fundo (inclusiva), ou null se a imagem está vazia. */
export function contentBox(mask: Uint8Array, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Reamostra a área `box` em células de `cell` pixels: cada célula vira a cor mais votada dentro
 * dela (ou transparente, se a maioria for fundo). Assim a "grade" torta da IA vira pixel art limpa.
 */
export function pixelize(img: Rgba, mask: Uint8Array, box: { x0: number; y0: number; x1: number; y1: number }, cell: number, outW: number, outH: number): Rgba {
  const out = blank(outW, outH);
  // Ancorado embaixo e centralizado: os pés ficam na última linha.
  const ox = (box.x0 + box.x1 + 1) / 2 - (outW * cell) / 2;
  const oy = box.y1 + 1 - outH * cell;
  const votes = new Map<number, number>();
  const sums = new Map<number, [number, number, number, number]>();
  for (let j = 0; j < outH; j++)
    for (let i = 0; i < outW; i++) {
      votes.clear();
      sums.clear();
      let bgVotes = 0;
      const ya = Math.floor(oy + j * cell);
      const yb = Math.max(ya + 1, Math.floor(oy + (j + 1) * cell));
      const xa = Math.floor(ox + i * cell);
      const xb = Math.max(xa + 1, Math.floor(ox + (i + 1) * cell));
      for (let y = ya; y < yb; y++)
        for (let x = xa; x < xb; x++) {
          if (x < 0 || y < 0 || x >= img.width || y >= img.height || mask[y * img.width + x]) {
            bgVotes++;
            continue;
          }
          const p = (y * img.width + x) * 4;
          const r = img.data[p]!;
          const g = img.data[p + 1]!;
          const b = img.data[p + 2]!;
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
          votes.set(key, (votes.get(key) ?? 0) + 1);
          const s = sums.get(key) ?? [0, 0, 0, 0];
          s[0] += r;
          s[1] += g;
          s[2] += b;
          s[3]++;
          sums.set(key, s);
        }
      let bestKey = -1;
      let bestN = 0;
      for (const [k, n] of votes) if (n > bestN) [bestKey, bestN] = [k, n];
      if (bestKey < 0 || bgVotes > bestN + (yb - ya) * (xb - xa) * 0.15) continue;
      const s = sums.get(bestKey)!;
      const q = (j * outW + i) * 4;
      out.data[q] = Math.round(s[0] / s[3]);
      out.data[q + 1] = Math.round(s[1] / s[3]);
      out.data[q + 2] = Math.round(s[2] / s[3]);
      out.data[q + 3] = 255;
    }
  return out;
}

/** Reduz a paleta a até `k` cores (k-médias, determinístico). */
export function reducePalette(img: Rgba, k: number): Rgba {
  const px: [number, number, number][] = [];
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]! > 0) px.push([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]);
  const distinct = new Map<string, [number, number, number]>();
  for (const c of px) distinct.set(c.join(','), c);
  if (k <= 0 || distinct.size <= k) return img;
  // Sementes espalhadas: a cor mais distante das já escolhidas (farthest point).
  const colors = [...distinct.values()];
  const centers: [number, number, number][] = [colors[0]!];
  const d2 = (a: number[], b: number[]) => (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
  while (centers.length < k) {
    let far = colors[0]!;
    let farD = -1;
    for (const c of colors) {
      const d = Math.min(...centers.map((m) => d2(c, m)));
      if (d > farD) [far, farD] = [c, d];
    }
    centers.push([...far]);
  }
  const nearest = (c: number[]) => {
    let bi = 0;
    let bd = Infinity;
    centers.forEach((m, i) => {
      const d = d2(c, m);
      if (d < bd) [bi, bd] = [i, d];
    });
    return bi;
  };
  for (let iter = 0; iter < 8; iter++) {
    const acc = centers.map(() => [0, 0, 0, 0] as [number, number, number, number]);
    for (const c of px) {
      const a = acc[nearest(c)]!;
      a[0] += c[0];
      a[1] += c[1];
      a[2] += c[2];
      a[3]++;
    }
    acc.forEach((a, i) => {
      if (a[3]) centers[i] = [Math.round(a[0] / a[3]), Math.round(a[1] / a[3]), Math.round(a[2] / a[3])];
    });
  }
  const out = { ...img, data: new Uint8ClampedArray(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    const m = centers[nearest([out.data[i]!, out.data[i + 1]!, out.data[i + 2]!])]!;
    out.data[i] = m[0];
    out.data[i + 1] = m[1];
    out.data[i + 2] = m[2];
  }
  return out;
}

export function flipH(img: Rgba): Rgba {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const a = (y * img.width + x) * 4;
      const b = (y * img.width + (img.width - 1 - x)) * 4;
      for (let c = 0; c < 4; c++) out.data[b + c] = img.data[a + c]!;
    }
  return out;
}

/** Margem transparente em volta. */
export function padded(img: Rgba, pad: number): Rgba {
  if (pad <= 0) return img;
  const out = blank(img.width + pad * 2, img.height + pad * 2);
  for (let y = 0; y < img.height; y++) out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + pad) * out.width + pad) * 4);
  return out;
}

/** Quantas cores distintas (opacas) a imagem tem. */
export function colorCount(img: Rgba): number {
  const set = new Set<number>();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) set.add((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!);
  return set.size;
}

/**
 * Converte uma ou mais imagens geradas (quadros de uma animação) em pixel art do jogo.
 * Todos os quadros usam a mesma escala e o mesmo enquadramento (os pés não pulam entre quadros).
 * Devolve os quadros e a tira horizontal pronta.
 */
export function importSprite(frames: Rgba[], opts: Partial<ImportOptions> = {}): { frames: Rgba[]; sheet: Rgba; cell: number } {
  const o = { ...DEFAULT_IMPORT, ...opts };
  // O limite mínimo da tela (16) fica na interface; aqui aceita artes pequenas (ícones, testes).
  const height = Math.max(2, Math.min(IMPORT_LIMITS.maxHeight, Math.round(o.height)));
  if (!frames.length) throw new Error('nenhuma imagem');
  const masks = frames.map((f) => backgroundMask(f, o.tolerance));
  const boxes = frames.map((f, i) => contentBox(masks[i]!, f.width, f.height));
  if (boxes.some((b) => !b)) throw new Error('imagem vazia: tudo virou fundo (diminua a tolerância)');
  // Enquadramento comum: a maior altura e a maior largura entre os quadros.
  const tall = Math.max(...boxes.map((b) => b!.y1 - b!.y0 + 1));
  const wide = Math.max(...boxes.map((b) => b!.x1 - b!.x0 + 1));
  const cell = tall / height;
  const outW = Math.max(1, Math.ceil(wide / cell));
  let out = frames.map((f, i) => pixelize(f, masks[i]!, boxes[i]!, cell, outW, height));
  if (o.colors > 0) {
    // Mesma paleta para todos os quadros: reduz a tira inteira de uma vez.
    const sheet = joinFrames(out);
    const reduced = reducePalette(sheet, Math.min(IMPORT_LIMITS.maxColors, o.colors));
    out = splitFrames(reduced, out.length);
  }
  if (o.flip) out = out.map(flipH);
  out = out.map((f) => padded(f, o.pad));
  return { frames: out, sheet: joinFrames(out), cell };
}

/** Junta quadros do mesmo tamanho numa tira horizontal. */
export function joinFrames(frames: Rgba[]): Rgba {
  const fw = frames[0]!.width;
  const fh = frames[0]!.height;
  const out = blank(fw * frames.length, fh);
  frames.forEach((f, n) => {
    for (let y = 0; y < fh; y++) out.data.set(f.data.subarray(y * fw * 4, (y + 1) * fw * 4), (y * out.width + n * fw) * 4);
  });
  return out;
}

export function splitFrames(sheet: Rgba, n: number): Rgba[] {
  const fw = Math.floor(sheet.width / n);
  return Array.from({ length: n }, (_, k) => {
    const f = blank(fw, sheet.height);
    for (let y = 0; y < sheet.height; y++) f.data.set(sheet.data.subarray((y * sheet.width + k * fw) * 4, (y * sheet.width + (k + 1) * fw) * 4), y * fw * 4);
    return f;
  });
}

/** Nome do arquivo para um espaço: imagem parada, pose ou habilidade. */
export function artFile(creatureId: string, slot: string): string {
  if (slot === 'base') return `assets/sprites/criaturas/${creatureId}.png`;
  return `assets/sprites/criaturas/${creatureId}/${slot.replace(':', '_')}.png`;
}

/** Id de criatura a partir do nome do arquivo (lote): "Urso Chifre (2).png" → "urso_chifre". */
export function idFromFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Recorta um pedaço da imagem (com o fundo original). */
export function crop(img: Rgba, x0: number, y0: number, x1: number, y1: number): Rgba {
  const out = blank(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) out.data.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1 + 1) * 4), (y - y0) * out.width * 4);
  return out;
}

/** Faixas [início, fim] onde `has(i)` é verdadeiro, separadas por vãos de pelo menos `gap`. */
function bands(n: number, has: (i: number) => boolean, gap: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let empty = 0;
  for (let i = 0; i < n; i++) {
    if (has(i)) {
      if (start < 0) start = i;
      empty = 0;
    } else if (start >= 0 && ++empty >= gap) {
      out.push([start, i - empty]);
      start = -1;
      empty = 0;
    }
  }
  if (start >= 0) out.push([start, n - 1 - empty]);
  return out;
}

/**
 * Folha de poses (várias poses do mesmo personagem numa imagem só): separa cada figura pelos vãos
 * de fundo entre elas — primeiro em linhas, depois em colunas — na ordem de leitura. Figuras menores
 * que `minSize` (sujeira, texto) são descartadas. Cada pedaço mantém o fundo, para o importador.
 */
export function splitPoseSheet(img: Rgba, tolerance: number = DEFAULT_IMPORT.tolerance, minSize = 24): Rgba[] {
  const mask = backgroundMask(img, tolerance);
  const w = img.width;
  const gap = Math.max(4, Math.round(Math.min(img.width, img.height) * 0.01));
  const rowHas = (y: number) => {
    for (let x = 0; x < w; x++) if (!mask[y * w + x]) return true;
    return false;
  };
  const cells: Rgba[] = [];
  for (const [y0, y1] of bands(img.height, rowHas, gap)) {
    const colHas = (x: number) => {
      for (let y = y0; y <= y1; y++) if (!mask[y * w + x]) return true;
      return false;
    };
    for (const [x0, x1] of bands(w, colHas, gap)) {
      if (x1 - x0 + 1 < minSize || y1 - y0 + 1 < minSize) continue;
      // Margem de fundo em volta: o importador acha o fundo pelas bordas do pedaço.
      const m = 2;
      cells.push(crop(img, Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(w - 1, x1 + m), Math.min(img.height - 1, y1 + m)));
    }
  }
  return cells;
}

/** Ordem padrão das poses numa folha (da esquerda para a direita, linha a linha). */
export const SHEET_ORDER = ['idle', 'attack', 'hurt', 'cast', 'move', 'jump', 'fallen', 'dead'] as const;
