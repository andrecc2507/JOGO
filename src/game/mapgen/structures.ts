/**
 * Estruturas do editor de mapas (casas, torres, muralhas, pontes…): carimbos de vários tiles no estilo
 * Final Fantasy Tactics — uma casa é um bloco de tiles elevados com telhado em cima e paredes nas
 * laterais (dá para subir no telhado), com cumeeira mais alta e porta na frente. Módulo puro.
 */
import { MAX_HEIGHT, inBounds, type BattleMap, type Prop, type Terrain, type Tile } from '../battle/map';

export type StructureId =
  | 'casa_vila'
  | 'casa_pedra'
  | 'casa_deserto'
  | 'torre'
  | 'muralha'
  | 'ponte'
  | 'praca'
  | 'mercado'
  | 'parede_caverna'
  | 'ruina'
  | 'cripta';

export interface StructureDef {
  name: string;
  /** Época e lugar na história (dica na paleta). */
  hint: string;
  /** Tamanho padrão (largura × profundidade) e limites do editor. */
  w: number;
  h: number;
  min: number;
  max: number;
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  casa_vila: { name: 'Casa de vila (palha, enxaimel)', hint: 'Aldeias de Aurélia e Silvânia', w: 3, h: 3, min: 2, max: 6 },
  casa_pedra: { name: 'Casa de pedra (ardósia)', hint: 'Bastiamar, Cristália, Citadela', w: 3, h: 4, min: 2, max: 6 },
  casa_deserto: { name: 'Casa de adobe (terraço)', hint: "Vel'Qadar e Sahrim", w: 3, h: 3, min: 2, max: 6 },
  torre: { name: 'Torre de vigia', hint: 'Muralhas, fortes, Citadela', w: 2, h: 2, min: 1, max: 3 },
  muralha: { name: 'Muralha (trecho)', hint: 'Cidades fortificadas', w: 6, h: 1, min: 1, max: 24 },
  ponte: { name: 'Ponte de madeira', hint: 'Rios e portos (sobre água)', w: 5, h: 2, min: 1, max: 24 },
  praca: { name: 'Praça com fonte', hint: 'Centro de cidade (Solenne, Bastiamar)', w: 5, h: 5, min: 3, max: 9 },
  mercado: { name: 'Mercado (bancas)', hint: 'Feiras e portos', w: 5, h: 4, min: 3, max: 9 },
  parede_caverna: { name: 'Parede de caverna', hint: 'Minas, grutas, covis', w: 3, h: 3, min: 1, max: 12 },
  ruina: { name: 'Ruína', hint: 'Citadela arruinada (Ato 5), templos antigos', w: 4, h: 4, min: 3, max: 8 },
  cripta: { name: 'Cripta / cemitério', hint: 'Templo de Aster, catacumbas', w: 4, h: 3, min: 3, max: 8 },
};

/** Sorteio determinístico por posição (o mesmo carimbo sai igual no mesmo lugar). */
function hash(x: number, y: number, k: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function tilesIn(map: BattleMap, x0: number, y0: number, w: number, h: number): { x: number; y: number; t: Tile; edge: boolean }[] {
  const out: { x: number; y: number; t: Tile; edge: boolean }[] = [];
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      if (!inBounds(map, x, y)) continue;
      out.push({ x, y, t: map.tiles[y * map.w + x]!, edge: x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1 });
    }
  return out;
}

function clearTile(t: Tile): void {
  t.p = null;
  t.s = null;
  t.c = null;
  t.spawn = null;
  delete t.door;
}

/** Altura de chão sob a estrutura: a mais comum no retângulo (o terreno é aplainado nela). */
function baseHeight(cells: { t: Tile }[]): number {
  const count = new Map<number, number>();
  for (const c of cells) count.set(c.t.h, (count.get(c.t.h) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

/**
 * Casa: bloco de `walls` níveis, telhado de `roof` em cima, cumeeira (+1) no meio do lado mais longo
 * e porta na frente (lado de y maior, no meio).
 */
function house(map: BattleMap, x0: number, y0: number, w: number, h: number, roof: Terrain, walls: number, ridge: boolean): void {
  const cells = tilesIn(map, x0, y0, w, h);
  const base = baseHeight(cells);
  const alongX = w >= h;
  for (const { x, y, t } of cells) {
    clearTile(t);
    t.t = roof;
    const mid = alongX ? (h - 1) / 2 : (w - 1) / 2;
    const off = alongX ? Math.abs(y - y0 - mid) : Math.abs(x - x0 - mid);
    t.h = Math.min(MAX_HEIGHT, base + walls + (ridge && off < 0.6 ? 1 : 0));
  }
  const door = map.tiles[(y0 + h - 1) * map.w + x0 + Math.floor((w - 1) / 2)];
  if (door && inBounds(map, x0 + Math.floor((w - 1) / 2), y0 + h - 1)) door.door = true;
}

/** Carimba a estrutura com o canto de cima-esquerda em (x0, y0). Devolve quantos tiles mudou. */
export function stamp(map: BattleMap, id: StructureId, x0: number, y0: number, w = STRUCTURES[id].w, h = STRUCTURES[id].h): number {
  const def = STRUCTURES[id];
  w = Math.max(def.min, Math.min(def.max, Math.round(w)));
  h = Math.max(def.min === 1 && (id === 'muralha' || id === 'ponte') ? 1 : def.min, Math.min(def.max, Math.round(h)));
  const cells = tilesIn(map, x0, y0, w, h);
  if (!cells.length) return 0;
  const base = baseHeight(cells);
  const put = (x: number, y: number, p: Prop) => {
    if (!inBounds(map, x, y)) return;
    const t = map.tiles[y * map.w + x]!;
    if (t.t !== 'agua_funda') t.p = p;
  };
  switch (id) {
    case 'casa_vila':
      house(map, x0, y0, w, h, 'palha', 2, true);
      break;
    case 'casa_pedra':
      house(map, x0, y0, w, h, 'ardosia', 3, true);
      break;
    case 'casa_deserto':
      house(map, x0, y0, w, h, 'adobe', 2, false);
      // Parapeito no terraço: caixas e barris de mercadoria.
      put(x0 + w - 1, y0, 'barril');
      break;
    case 'torre':
      for (const { t } of cells) {
        clearTile(t);
        t.t = 'muralha';
        t.h = Math.min(MAX_HEIGHT, base + 5);
      }
      put(x0, y0, 'estandarte');
      break;
    case 'muralha':
      for (const { x, y, t } of cells) {
        clearTile(t);
        t.t = 'muralha';
        // Ameias: um a cada dois tiles fica um nível mais alto.
        t.h = Math.min(MAX_HEIGHT, base + 3 + ((x + y) % 2 === 0 ? 1 : 0));
      }
      break;
    case 'ponte':
      for (const { x, y, t, edge } of cells) {
        clearTile(t);
        t.t = 'madeira';
        t.h = base;
        const side = w >= h ? y === y0 || y === y0 + h - 1 : x === x0 || x === x0 + w - 1;
        if (edge && side && h > 1 && w > 1 && (x + y) % 2 === 0) t.p = 'cerca';
      }
      break;
    case 'praca': {
      for (const { t } of cells) {
        clearTile(t);
        t.t = 'paralelepipedo';
        t.h = base;
      }
      const cx = x0 + Math.floor(w / 2);
      const cy = y0 + Math.floor(h / 2);
      put(cx, cy, 'fonte');
      put(x0, y0, 'lampiao');
      put(x0 + w - 1, y0 + h - 1, 'lampiao');
      if (w >= 5) {
        put(cx - 2, cy, 'banco');
        put(cx + 2, cy, 'banco');
      }
      break;
    }
    case 'mercado': {
      for (const { x, y, t } of cells) {
        clearTile(t);
        t.t = 'paralelepipedo';
        t.h = base;
        // Fileiras de bancas com corredor no meio.
        if ((y - y0) % 3 === 0 && (x - x0) % 2 === 0) t.p = 'banca';
        else if ((y - y0) % 3 === 1 && hash(x, y, 3) < 0.25) t.p = hash(x, y, 4) < 0.5 ? 'barril' : 'caixa';
      }
      break;
    }
    case 'parede_caverna':
      for (const { x, y, t, edge } of cells) {
        clearTile(t);
        t.t = 'rocha_viva';
        t.h = Math.min(MAX_HEIGHT, base + 3 + (edge ? 0 : 1) + (hash(x, y, 1) < 0.3 ? 1 : 0));
      }
      break;
    case 'ruina':
      for (const { x, y, t, edge } of cells) {
        clearTile(t);
        t.t = hash(x, y, 1) < 0.7 ? 'lajota' : 'cascalho';
        t.h = base;
        if (edge) {
          const r = hash(x, y, 2);
          if (r < 0.35) {
            t.t = 'muralha';
            t.h = base + 1 + Math.floor(hash(x, y, 5) * 3);
          } else if (r < 0.55) t.p = 'pilar_quebrado';
          else if (r < 0.65) t.p = 'pilar';
        } else if (hash(x, y, 6) < 0.12) t.p = 'pilar_quebrado';
      }
      break;
    case 'cripta':
      for (const { x, y, t, edge } of cells) {
        clearTile(t);
        t.t = edge ? 'lajota' : 'terra';
        t.h = base;
        if (!edge && (x - x0) % 2 === 1) t.p = hash(x, y, 1) < 0.25 ? 'sarcofago' : 'lapide';
        else if (edge && (x + y) % 3 === 0) t.p = 'cerca';
      }
      put(x0, y0, 'estatua');
      put(x0 + w - 1, y0, 'lampiao');
      break;
  }
  return cells.length;
}
