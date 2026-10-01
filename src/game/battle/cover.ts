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
  const rise = t.h - here.h;
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
