import { DIRS, PROPS, tileAt, type BattleMap } from './map';

/** Cobertura no estilo XCOM: obstáculo encostado entre o alvo e o atirador. */
export type CoverLevel = 'none' | 'half' | 'full';

/** Redução da chance de acerto de ataques físicos à distância. */
export const COVER_PENALTY: Record<CoverLevel, number> = { none: 0, half: 20, full: 40 };

const RANK: Record<CoverLevel, number> = { none: 0, half: 1, full: 2 };

/** Cobertura dada pelo tile vizinho (x+dx, y+dy) a quem está em (x, y). */
export function coverFrom(map: BattleMap, x: number, y: number, dx: number, dy: number): CoverLevel {
  const here = tileAt(map, x, y);
  const t = tileAt(map, x + dx, y + dy);
  if (!here || !t) return 'none';
  let level: CoverLevel = 'none';
  // Peças de prédio e construções (muralha, barricada) contam como relevo na altura de quem se protege.
  let rise = t.h - here.h;
  for (const p of t.up ?? []) if (p.b <= here.h + 0.5 && p.h > here.h) rise = Math.max(rise, p.h - here.h);
  if (rise >= 2) level = 'full';
  else if (rise === 1) level = 'half';
  if (t.p) {
    const p = PROPS[t.p];
    const prop: CoverLevel = p.blocksLos && p.height >= 2 ? 'full' : 'half';
    if (RANK[prop] > RANK[level]) level = prop;
  }
  return level;
}

/** Lados cobertos de um tile (para desenhar os escudos ao planejar o movimento). */
export function coverSides(map: BattleMap, x: number, y: number): { dx: number; dy: number; level: CoverLevel }[] {
  const out: { dx: number; dy: number; level: CoverLevel }[] = [];
  for (const [dx, dy] of DIRS) {
    const level = coverFrom(map, x, y, dx, dy);
    if (level !== 'none') out.push({ dx, dy, level });
  }
  return out;
}

/** Objeto (tile) que dá a cobertura de (x, y) contra um tiro vindo de (ax, ay), ou null (degrau ou nada). */
export function coverPropAgainst(map: BattleMap, x: number, y: number, ax: number, ay: number): [number, number] | null {
  if (Math.abs(ax - x) + Math.abs(ay - y) <= 1) return null;
  let best: [number, number] | null = null;
  let rank = 0;
  for (const [dx, dy] of DIRS) {
    if ((ax - x) * dx + (ay - y) * dy <= 0) continue;
    const t = tileAt(map, x + dx, y + dy);
    if (!t?.p) continue;
    const r = RANK[coverFrom(map, x, y, dx, dy)];
    if (r > rank) {
      rank = r;
      best = [x + dx, y + dy];
    }
  }
  return best;
}

/** Melhor cobertura de (x, y) contra um atacante em (ax, ay). Corpo a corpo ignora cobertura. */
export function coverAgainst(map: BattleMap, x: number, y: number, ax: number, ay: number): CoverLevel {
  if (Math.abs(ax - x) + Math.abs(ay - y) <= 1) return 'none';
  let best: CoverLevel = 'none';
  for (const s of coverSides(map, x, y)) {
    // O obstáculo só protege se estiver do lado de onde vem o tiro (flanquear anula a cobertura).
    if ((ax - x) * s.dx + (ay - y) * s.dy <= 0) continue;
    if (RANK[s.level] > RANK[best]) best = s.level;
  }
  return best;
}
