/**
 * Estruturas do editor de mapas (casas, torres, muralhas, pontes…): carimbos de vários tiles.
 * Casas, torres e prédios são ocos e feitos de peças empilhadas (battle/stack.ts): paredes por andar,
 * janelas (vão de 1 nível: dá para atirar por elas), porta na frente, lajes entre andares, escada
 * interna que vai até o telhado (alçapão) e telhado onde se anda. Tudo pode ser destruído e desabar.
 * Módulo puro.
 */
import { MAX_HEIGHT, inBounds, type BattleMap, type Prop, type Slab, type Terrain, type Tile } from '../battle/map';
import { STOREY } from '../battle/stack';

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
  | 'cripta'
  | 'predio';

export interface StructureDef {
  name: string;
  /** Época e lugar na história (dica na paleta). */
  hint: string;
  /** Tamanho padrão (largura × profundidade) e limites do editor. */
  w: number;
  h: number;
  min: number;
  max: number;
  /** Andares (prédios): padrão e máximo. */
  floors?: { def: number; max: number };
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  casa_vila: { name: 'Casa de vila (palha, enxaimel)', hint: 'Aldeias de Aurélia e Silvânia', w: 4, h: 4, min: 3, max: 9, floors: { def: 1, max: 3 } },
  casa_pedra: { name: 'Casa de pedra (ardósia)', hint: 'Bastiamar, Cristália, Citadela', w: 4, h: 5, min: 3, max: 10, floors: { def: 2, max: 4 } },
  casa_deserto: { name: 'Casa de adobe (terraço)', hint: "Vel'Qadar e Sahrim", w: 4, h: 4, min: 3, max: 9, floors: { def: 1, max: 3 } },
  torre: { name: 'Torre de vigia', hint: 'Muralhas, fortes, Citadela', w: 3, h: 3, min: 3, max: 6, floors: { def: 4, max: 20 } },
  predio: { name: 'Prédio de vários andares', hint: 'Citadela Real, guildas, Bastiamar', w: 5, h: 5, min: 3, max: 12, floors: { def: 3, max: 20 } },
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
  delete t.open;
  delete t.up;
  delete t.ladder;
}

export interface BuildingStyle {
  wall: Terrain;
  floor: Terrain;
  roof: Terrain;
  /** Cumeeira (telhado de duas águas) no meio do lado mais comprido. */
  ridge?: boolean;
  /** Chance de janela por trecho de parede (0–1). */
  windows: number;
  /** Escada encostada do lado de fora (sobe direto ao telhado). */
  outsideLadder?: boolean;
  furniture: Prop[];
}

const STYLE: Record<'casa_vila' | 'casa_pedra' | 'casa_deserto' | 'torre' | 'predio', BuildingStyle> = {
  casa_vila: { wall: 'enxaimel', floor: 'madeira', roof: 'palha', ridge: true, windows: 0.35, furniture: ['mesa', 'barril', 'feno', 'bau', 'banco'] },
  casa_pedra: { wall: 'muralha', floor: 'madeira', roof: 'ardosia', ridge: true, windows: 0.3, furniture: ['mesa', 'estante', 'bau', 'barril', 'banco'] },
  casa_deserto: { wall: 'adobe', floor: 'arenito', roof: 'adobe', windows: 0.3, outsideLadder: true, furniture: ['barril', 'caixa', 'bau', 'mesa'] },
  torre: { wall: 'muralha', floor: 'lajota', roof: 'muralha', windows: 0.25, furniture: ['barril', 'caixa', 'estandarte'] },
  predio: { wall: 'tijolo', floor: 'madeira', roof: 'ardosia', windows: 0.4, furniture: ['mesa', 'estante', 'bau', 'banco', 'barril'] },
};

/**
 * Prédio oco de `floors` andares no retângulo: parede em volta (com janelas e a porta no meio da frente,
 * lado de y maior), lajes entre os andares, escada interna até o telhado e telhado plano (ou com
 * cumeeira) onde dá para andar. Andar k tem o piso em base + k·STOREY.
 */
export function building(map: BattleMap, x0: number, y0: number, w: number, h: number, floors: number, style: BuildingStyle): void {
  const cells = tilesIn(map, x0, y0, w, h);
  if (!cells.length) return;
  const base = baseHeight(cells);
  const roofTop = base + floors * STOREY;
  const doorX = x0 + Math.floor((w - 1) / 2);
  const doorY = y0 + h - 1;
  const corner = (x: number, y: number) => (x === x0 || x === x0 + w - 1) && (y === y0 || y === y0 + h - 1);
  const alongX = w >= h;
  const mid = alongX ? (h - 1) / 2 : (w - 1) / 2;
  for (const { x, y, t, edge } of cells) {
    clearTile(t);
    t.h = base;
    t.t = style.floor;
    const up: Slab[] = [];
    for (let k = 0; k < floors; k++) {
      const f = base + k * STOREY;
      const top = k === floors - 1 ? roofTop - 1 : f + STOREY;
      if (edge) {
        if (k === 0 && x === doorX && y === doorY) {
          // Porta: vão de 2 níveis; a verga fecha o andar.
          t.door = true;
          up.push({ b: f + 2, h: top, t: style.wall });
        } else if (!corner(x, y) && hash(x, y, 20 + k) < style.windows && top - f >= 3) {
          // Janela: peitoril, vão de 1 nível, parede em cima.
          up.push({ b: f, h: f + 1, t: style.wall }, { b: f + 2, h: top, t: style.wall });
        } else up.push({ b: f, h: top, t: style.wall });
      } else if (k > 0) up.push({ b: f - 1, h: f, t: style.floor });
    }
    // Telhado por cima de tudo; a cumeeira sobe um nível no meio.
    up.push({ b: roofTop - 1, h: roofTop, t: style.roof });
    const off = alongX ? Math.abs(y - y0 - mid) : Math.abs(x - x0 - mid);
    if (style.ridge && off < 0.6 && Math.min(w, h) >= 3) up.push({ b: roofTop, h: roofTop + 1, t: style.roof });
    // Junta peças encostadas da mesma parede (menos peças, mesma forma).
    const merged: Slab[] = [];
    for (const p of up) {
      const last = merged[merged.length - 1];
      if (last && last.h === p.b && last.t === p.t && edge && p.t === style.wall) last.h = p.h;
      else merged.push(p);
    }
    t.up = merged;
  }
  // Escada interna: canto de dentro do fundo, liga todos os andares e o telhado (alçapão).
  if (w >= 3 && h >= 3) {
    const lt = map.tiles[(y0 + 1) * map.w + x0 + 1];
    if (lt && inBounds(map, x0 + 1, y0 + 1)) lt.ladder = true;
  }
  // Escada do lado de fora, encostada na parede da esquerda.
  if (style.outsideLadder && inBounds(map, x0 - 1, y0 + 1)) {
    const ot = map.tiles[(y0 + 1) * map.w + x0 - 1]!;
    if (!ot.up?.length && ot.t !== 'agua_funda') {
      ot.ladder = true;
      ot.p = null;
    }
  }
  // Mobília: alguns objetos dentro de cada andar (longe da porta e da escada).
  for (const { x, y, t, edge } of cells) {
    if (edge || (x === x0 + 1 && y === y0 + 1) || (x === doorX && y === doorY - 1)) continue;
    for (let k = 0; k < floors; k++) {
      if (hash(x, y, 40 + k) > 0.22) continue;
      const pick = style.furniture[Math.floor(hash(x, y, 60 + k) * style.furniture.length)]!;
      if (k === 0) t.p = pick;
      else {
        const slab = t.up!.find((p) => p.h === base + k * STOREY);
        if (slab) slab.p = pick;
      }
    }
  }
}

/** Altura de chão sob a estrutura: a mais comum no retângulo (o terreno é aplainado nela). */
function baseHeight(cells: { t: Tile }[]): number {
  const count = new Map<number, number>();
  for (const c of cells) count.set(c.t.h, (count.get(c.t.h) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

/** Carimba a estrutura com o canto de cima-esquerda em (x0, y0). Devolve quantos tiles mudou. */
export function stamp(map: BattleMap, id: StructureId, x0: number, y0: number, w = STRUCTURES[id].w, h = STRUCTURES[id].h, floors?: number): number {
  const def = STRUCTURES[id];
  w = Math.max(def.min, Math.min(def.max, Math.round(w)));
  h = Math.max(def.min === 1 && (id === 'muralha' || id === 'ponte') ? 1 : def.min, Math.min(def.max, Math.round(h)));
  // Prédios inteiros dentro do mapa (um prédio cortado na borda ficaria sem parede).
  if (def.floors) {
    if (w > map.w || h > map.h) return 0;
    x0 = Math.max(0, Math.min(x0, map.w - w));
    y0 = Math.max(0, Math.min(y0, map.h - h));
  }
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
    case 'casa_pedra':
    case 'casa_deserto':
    case 'torre':
    case 'predio': {
      const n = Math.max(1, Math.min(def.floors!.max, Math.round(floors ?? def.floors!.def)));
      building(map, x0, y0, w, h, n, STYLE[id]);
      if (id === 'torre') {
        // Estandarte no topo da torre.
        const top = map.tiles[y0 * map.w + x0];
        const roof = top?.up?.[top.up.length - 1];
        if (roof) roof.p = 'estandarte';
      }
      break;
    }
    case 'muralha':
      for (const { x, y, t } of cells) {
        clearTile(t);
        t.h = base;
        // Muralha de peças (dá para derrubar); ameias: um a cada dois tiles fica um nível mais alto.
        t.up = [{ b: base, h: base + 3, t: 'muralha' }];
        if ((x + y) % 2 === 0) t.up.push({ b: base + 3, h: base + 4, t: 'muralha' });
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
            // Resto de parede (peça: dá para derrubar).
            t.up = [{ b: base, h: base + 1 + Math.floor(hash(x, y, 5) * 3), t: 'muralha' }];
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

/** Coluna de parede: abre (ou fecha) uma janela em cada andar (vão de 1 nível acima do peitoril). */
export function toggleWindows(t: Tile): boolean {
  if (!t.up?.length) return false;
  const hasGap = t.up.some((p, k) => k > 0 && p.b - t.up![k - 1]!.h === 1);
  if (hasGap) {
    // Fecha: junta as peças separadas por vão de 1 nível.
    const out: Slab[] = [];
    for (const p of t.up) {
      const last = out[out.length - 1];
      if (last && p.b - last.h === 1 && last.t === p.t) last.h = p.h;
      else out.push({ ...p });
    }
    t.up = out;
    return true;
  }
  const out: Slab[] = [];
  for (const p of t.up) {
    let cur: Slab = { ...p };
    // Andares cujo piso fica dentro desta peça e cabem peitoril + vão + verga.
    for (let f = t.h; f + STOREY <= p.h; f += STOREY) {
      if (f < cur.b || f + STOREY > cur.h) continue;
      out.push({ ...cur, b: cur.b, h: f + 1, p: null });
      cur = { ...cur, b: f + 2 };
    }
    if (cur.h > cur.b) out.push(cur);
  }
  t.up = out;
  return true;
}

/** Porta no térreo de uma coluna de parede: abre o vão de 2 níveis e liga/desliga a porta. */
export function toggleDoorway(t: Tile): void {
  if (!t.up?.length) {
    t.door = !t.door;
    return;
  }
  const first = t.up[0]!;
  if (first.b - t.h >= 2) {
    t.door = !t.door;
    if (!t.door) delete t.open;
    return;
  }
  // Abre o vão: a primeira peça passa a começar 2 níveis acima do chão.
  if (first.h - (t.h + 2) <= 0) t.up.shift();
  else first.b = t.h + 2;
  if (!t.up.length) delete t.up;
  t.door = true;
}
