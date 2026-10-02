import type { BattleResult } from '../battle/types';

/**
 * Telemetria de playtest (local, sem rede): quantas batalhas, quantas rodadas, quantas mortes e
 * como foi cada missão da história. Serve para calibrar dificuldade e duração; aparece no Diário
 * (aba Registro) e pode ser copiada em JSON pelo painel de desenvolvimento.
 */
export interface MissionStats {
  tries: number;
  wins: number;
  rounds: number;
  deaths: number;
}

export interface PlayStats {
  battles: number;
  victories: number;
  defeats: number;
  fled: number;
  rounds: number;
  heroDeaths: number;
  kills: number;
  byKind: Record<string, number>;
  missions: Record<string, MissionStats>;
  /** Horas de jogo da campanha na última atualização. */
  hours: number;
}

export interface StatsHost {
  hours: number;
  stats?: PlayStats;
}

export function ensureStats(c: StatsHost): PlayStats {
  return (c.stats ??= { battles: 0, victories: 0, defeats: 0, fled: 0, rounds: 0, heroDeaths: 0, kills: 0, byKind: {}, missions: {}, hours: c.hours });
}

export function recordBattle(c: StatsHost, r: BattleResult): void {
  const s = ensureStats(c);
  s.battles += 1;
  if (r.outcome === 'victory') s.victories += 1;
  else if (r.outcome === 'defeat') s.defeats += 1;
  else s.fled += 1;
  s.rounds += r.rounds;
  const deaths = r.units.filter((u) => !u.alive).length;
  s.heroDeaths += deaths;
  s.kills += r.units.reduce((a, u) => a + u.kills, 0);
  s.byKind[r.context.kind] = (s.byKind[r.context.kind] ?? 0) + 1;
  s.hours = c.hours;
  const id = r.context.storyId;
  if (id) {
    const m = (s.missions[id] ??= { tries: 0, wins: 0, rounds: 0, deaths: 0 });
    m.tries += 1;
    if (r.outcome === 'victory') m.wins += 1;
    m.rounds += r.rounds;
    m.deaths += deaths;
  }
}

/** Resumo legível (aba Registro do Diário e tela final). */
export function statsLines(c: StatsHost): string[] {
  const s = ensureStats(c);
  const avg = s.battles ? (s.rounds / s.battles).toFixed(1) : '—';
  const missions = Object.values(s.missions);
  const retries = missions.reduce((a, m) => a + Math.max(0, m.tries - m.wins), 0);
  return [
    `Batalhas: ${s.battles} (${s.victories} vitórias, ${s.defeats} derrotas, ${s.fled} fugas)`,
    `Rodadas por batalha: ${avg}`,
    `Heróis mortos: ${s.heroDeaths} · Inimigos abatidos: ${s.kills}`,
    `Missões da história jogadas: ${missions.length} · tentativas perdidas: ${retries}`,
    `Por tipo: ${Object.entries(s.byKind).map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`).join(' · ') || '—'}`,
    `Tempo de campanha: ${Math.floor(c.hours / 24)} dias`,
  ];
}

const KIND_LABEL: Record<string, string> = { encounter: 'encontros', contract: 'contratos', story: 'história', dev: 'teste', editor: 'editor' };
