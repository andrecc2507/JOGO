import { node, nodeOpen } from './layout';
import { province, provinceOf, provinces } from './provinces';

/**
 * Territórios e névoa do mapa (C8, C10). Cada província tem dono, controle (0–100, quão firme o dono
 * a segura) e medo (0–100: em 100 ela cai para quem a ameaça). A névoa guarda se a província é
 * conhecida e quando foi vista pela última vez: a informação envelhece.
 */
export type Owner = 'coroa' | 'resistencia' | 'culto' | 'vazio' | 'livre';

export const OWNER_LABEL: Record<Owner, string> = { coroa: 'Coroa', resistencia: 'Resistência', culto: 'Culto do Véu', vazio: 'Vazio', livre: 'Livre' };
export const OWNER_COLOR: Record<Owner, string> = { coroa: '#c9a14a', resistencia: '#4fc3f7', culto: '#b71c1c', vazio: '#7e57c2', livre: '#9e9e9e' };

export interface ProvinceState {
  owner: Owner;
  control: number;
  fear: number;
  /** Já foi visitada ou revelada. */
  known: boolean;
  /** Hora da campanha em que foi vista por último (ausente = nunca). */
  seenAt?: number;
}

export interface WorldHost {
  hours: number;
  world?: WorldState;
}

export interface WorldState {
  provinces: Record<string, ProvinceState>;
  /** Forças inimigas no mapa (world/forces.ts). */
  forces?: import('./forces').Force[];
  /** Próximo dia em que surge uma força e em que estoura uma crise. */
  nextForceDay?: number;
  nextCrisisDay?: number;
  /** Capítulo cujo mapa político já foi aplicado (world/commander.ts, `chapterTerritory`). */
  chapter?: number;
}

/** Horas até a informação de uma província ficar velha (estimativas perdem precisão). */
export const STALE_HOURS = 24 * 10;

export function ensureWorld(c: WorldHost): WorldState {
  if (c.world) {
    // Províncias novas (saves antigos ou mapa ampliado) entram com o padrão.
    for (const p of provinces()) c.world.provinces[p.id] ??= initialState(p.id);
    return c.world;
  }
  const w: WorldState = { provinces: {} };
  for (const p of provinces()) w.provinces[p.id] = initialState(p.id);
  c.world = w;
  return w;
}

function initialState(id: string): ProvinceState {
  const n = node(id);
  if (n.realm === 'reino') return { owner: 'coroa', control: 65, fear: 10, known: true, seenAt: 0 };
  return { owner: 'livre', control: 40, fear: 20, known: false };
}

export function provinceState(c: WorldHost, id: string): ProvinceState {
  return ensureWorld(c).provinces[provinceOf(id)]!;
}

/** Um esquadrão chegou (ou passou) por aqui: a província e as vizinhas ficam conhecidas e atualizadas. */
export function reveal(c: WorldHost, nodeId: string, chapter = 99): string[] {
  const w = ensureWorld(c);
  const pid = provinceOf(nodeId);
  const found: string[] = [];
  const touch = (id: string, full: boolean) => {
    const st = w.provinces[id];
    if (!st || !nodeOpen(node(id), chapter)) return;
    if (!st.known) found.push(id);
    st.known = true;
    if (full) st.seenAt = c.hours;
  };
  touch(pid, true);
  for (const nb of province(pid)?.neighbors ?? []) touch(nb, false);
  return found;
}

/** Idade da informação, em horas (Infinity = nunca vista de perto). */
export function infoAge(c: WorldHost, id: string): number {
  const st = provinceState(c, id);
  return st.seenAt === undefined ? Infinity : c.hours - st.seenAt;
}

/** Faixa de estimativa (ex.: inimigos 4–7): estreita se a informação é recente, larga se é velha. */
export function estimate(c: WorldHost, id: string, real: number): [number, number] {
  const age = infoAge(c, id);
  const spread = age === Infinity ? 0.8 : Math.min(0.8, 0.1 + age / STALE_HOURS / 2);
  return [Math.max(0, Math.floor(real * (1 - spread))), Math.ceil(real * (1 + spread))];
}

/** Muda o dono de uma província (controle recomeça baixo; o medo cai um pouco). */
export function setOwner(c: WorldHost, id: string, owner: Owner, control = 35): void {
  const st = provinceState(c, id);
  st.owner = owner;
  st.control = control;
  st.fear = Math.max(0, st.fear - 30);
}

/** Províncias de um dono. */
export function ownedBy(c: WorldHost, owner: Owner): string[] {
  const w = ensureWorld(c);
  return Object.entries(w.provinces)
    .filter(([, st]) => st.owner === owner)
    .map(([id]) => id);
}
