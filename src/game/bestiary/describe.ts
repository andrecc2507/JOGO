import type { CreatureSkill, FxStatus, SkillFx } from '../data';
import { STATUS_INFO, type StatusId } from '../battle/types';

/**
 * Resumo mecânico de uma habilidade de criatura, gerado a partir dos dados.
 * Mostra no editor e na batalha o que o motor realmente faz.
 */

export const KIND_LABEL: Record<CreatureSkill['kind'], string> = {
  physical: 'Ataque corpo a corpo/físico',
  ranged: 'Ataque à distância',
  magic: 'Magia',
  buff: 'Reforço em aliados',
  heal: 'Cura',
  utility: 'Em si mesma',
  summon: 'Invocação',
  passive: 'Passiva',
  reaction: 'Reação',
};

const COND: Record<string, string> = {
  snow: 'na neve',
  tree: 'perto de árvores',
  bush: 'perto de vegetação',
  water: 'na água',
  sand: 'na areia',
  grass: 'na grama',
  still: 'se ficou parada',
  low_hp: 'com pouca vida',
  not_hit: 'se não foi atingida',
  hidden: 'escondida',
};

const REACT_ON: Record<string, string> = {
  physical: 'golpe físico',
  ranged: 'ataque à distância',
  melee: 'golpe corpo a corpo',
  magic: 'magia',
  any: 'qualquer golpe',
  crit: 'golpe crítico',
  heavy: 'golpe pesado',
};

const REACT_DO: Record<string, string> = {
  dodge: 'esquiva',
  negate: 'anula o dano',
  reflect: 'reflete o dano',
  counter: 'contra-ataca',
  status: 'pune o atacante',
  retreat: 'esquiva e recua',
  swap: 'troca dois inimigos de lugar',
};

function st(s: FxStatus): string {
  return `${STATUS_INFO[s.id as StatusId]?.name ?? s.id} ${s.turns}t`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function describeFx(f: SkillFx): string[] {
  const out: string[] = [];
  if (f.hits && f.hits > 1) out.push(`${f.hits} golpes`);
  if (f.randomTargets) out.push(f.randomTargets >= 99 ? (f.spareOne ? 'todos os inimigos menos um' : 'todos os inimigos') : `${f.randomTargets} inimigos aleatórios`);
  if (f.leap) out.push('salta até o alvo');
  if (f.behind) out.push('surge atrás do alvo');
  if (f.push) out.push(`empurra ${f.push} m`);
  if (f.pull) out.push(`puxa ${f.pull} m`);
  if (f.pierce) out.push(`ignora ${pct(f.pierce)} da defesa`);
  if (f.lifesteal) out.push(`rouba ${pct(f.lifesteal)} do dano em vida`);
  if (f.mpBurn) out.push(`queima ${f.mpBurn} MP`);
  if (f.vs) out.push(`×${f.vs.mult} contra ${f.vs.status.split('|').join('/')}`);
  if (f.crit) out.push(`+${f.crit}% crítico`);
  if (f.dispel) out.push('remove reforços');
  if (f.grab) out.push('agarra');
  if (f.link) out.push(`liga a vida a ${f.link} inimigos`);
  if (f.drainToShield) out.push('dano vira escudo');
  if (f.surface) out.push(`deixa ${f.surface} no chão`);
  for (const a of f.also ?? []) out.push(st(a));
  if (f.healPct) out.push(`cura ${pct(f.healPct)}`);
  if (f.cleanse) out.push('remove status negativos');
  if (f.hide) out.push(f.hide === 'any' ? 'esconde-se' : `esconde-se (${COND[f.hide] ?? f.hide})`);
  if (f.teleport) out.push('teleporta');
  if (f.shield) out.push(`escudo de ${pct(f.shield)} da vida`);
  if (f.self) out.push(`em si: ${st(f.self)}`);
  if (f.summon) out.push(`invoca ${f.summon.map((s) => `${s.count}× ${s.id}`).join(', ')}`);
  if (f.requires) out.push(`só ${COND[f.requires] ?? f.requires}`);
  if (f.evasion) out.push(`+${f.evasion} esquiva${f.when ? ` ${COND[f.when] ?? f.when}` : ''}`);
  if (f.regen) out.push(`regenera ${pct(f.regen)}/turno${f.when ? ` ${COND[f.when] ?? f.when}` : ''}`);
  if (f.reduce) {
    const r = f.reduce;
    if (r.physical) out.push(`−${pct(r.physical)} dano físico`);
    if (r.ranged) out.push(`−${pct(r.ranged)} dano à distância`);
    if (r.melee) out.push(`−${pct(r.melee)} dano corpo a corpo`);
    if (r.magic) out.push(`−${pct(r.magic)} dano mágico`);
  }
  if (f.immune?.length) out.push(`imune: ${f.immune.map((i) => STATUS_INFO[i as StatusId]?.name ?? i).join(', ')}`);
  if (f.ignoreOnce) out.push(`ignora ${STATUS_INFO[f.ignoreOnce as StatusId]?.name ?? f.ignoreOnce} 1× por batalha`);
  if (f.fury) out.push(`×${f.fury} dano abaixo de 50% de vida`);
  if (f.pack) out.push(`+${pct(f.pack.mult)} dano por ${f.pack.family} aliado`);
  if (f.flank) out.push(`+${pct(f.flank)} dano se um aliado cercar o alvo`);
  if (f.critBonus) out.push(`+${f.critBonus}% crítico`);
  if (f.seeHidden) out.push('enxerga escondidos');
  if (f.fly) out.push('voa');
  if (f.aura) out.push(`aura ${f.aura.radius >= 99 ? 'na arena toda' : `de ${f.aura.radius} m`}${f.aura.status ? `: ${st(f.aura.status)}` : ''}${f.aura.damagePct ? ` · ${pct(f.aura.damagePct)} de dano/rodada` : ''}`);
  if (f.revive) out.push(`ao cair vira casca e renasce em ${f.revive.rounds} turnos com ${pct(f.revive.pct)} da vida`);
  if (f.deathBurst) out.push(`explode ao morrer (raio ${f.deathBurst.radius})`);
  if (f.minionShield) out.push('imune enquanto as invocações vivem');
  if (f.summonStart) out.push(`começa com ${f.summonStart.map((s) => `${s.count}× ${s.id}`).join(', ')}`);
  if (f.summonEvery) out.push(`a cada ${f.summonEvery.rounds} rodadas invoca ${f.summonEvery.list.map((s) => `${s.count}× ${s.id}`).join(', ')}`);
  if (f.summonAt) out.push(`em ${f.summonAt.thresholds.map(pct).join('/')} de vida invoca ${f.summonAt.list.map((s) => `${s.count}× ${s.id}`).join(', ')}`);
  if (f.stances) out.push(`alterna a cada ${f.stances.every} rodada(s): ${f.stances.list.map((s) => s.name).join(' → ')}`);
  if (f.special) out.push(`mecânica: ${f.special}`);
  return out;
}

export function describeSkill(s: CreatureSkill): string {
  const parts: string[] = [KIND_LABEL[s.kind]];
  if (s.kind === 'reaction' && s.react) {
    const r = s.react;
    parts.push(`ao sofrer ${REACT_ON[r.on]}: ${REACT_DO[r.do]}${r.chance && r.chance < 100 ? ` (${r.chance}%)` : ''}${r.status ? ` · ${st(r.status)}` : ''}${r.damage ? ` · ${r.damage} de dano` : ''}`);
  }
  if (s.power) parts.push(`poder ${s.power}`);
  if (s.kind !== 'passive' && s.kind !== 'reaction') parts.push(s.range ? `alcance ${s.range} m` : 'em si');
  if (s.shape === 'cone') parts.push('cone');
  if (s.shape === 'line') parts.push('linha');
  if (s.radius) parts.push(`raio ${s.radius}`);
  if (s.element) parts.push(s.element);
  if (s.status) parts.push(st(s.status));
  if (s.cooldown) parts.push(`recarga ${s.cooldown}`);
  if (s.fx) parts.push(...describeFx(s.fx));
  return parts.join(' · ');
}
