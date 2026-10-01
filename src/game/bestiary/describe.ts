import { ATTR_SHORT, type CreatureSkill, type FxReaction, type FxStatus, type SkillFx } from '../data';
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
  still_sand: 'parada na areia',
  still_water: 'parada na água',
  has_summon: 'com invocação ativa',
  ground: 'em chão natural',
  healthy: 'com mais de 50% de vida',
};

const REACT_ON: Record<string, string> = {
  physical: 'golpe físico',
  ranged: 'ataque à distância',
  melee: 'golpe corpo a corpo',
  magic: 'magia',
  any: 'qualquer golpe',
  crit: 'golpe crítico',
  heavy: 'golpe pesado',
  summon: 'ataque de invocação',
};

const REACT_DO: Record<string, string> = {
  dodge: 'esquiva',
  negate: 'anula o dano',
  reflect: 'reflete o dano',
  counter: 'contra-ataca',
  status: 'pune o atacante',
  retreat: 'esquiva e recua',
  swap: 'troca dois inimigos de lugar',
  split: 'divide-se',
  mitigate: 'reduz o dano',
  riposte: 'esquiva e contra-ataca',
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
  if (f.backstab) out.push(`×${f.backstab} pelas costas ou escondido`);
  if (f.chain) out.push(`ricocheteia em ${f.chain}`);
  if (f.consume) out.push(`consome ${f.consume.status} → ${st(f.consume.apply)}`);
  if (f.detonate) out.push(`detona ${f.detonate.join('/')}`);
  if (f.execute) out.push(`executa abaixo de ${pct(f.execute)}`);
  if (f.critIfDebuffs) out.push(`crítico com ${f.critIfDebuffs}+ penalidades no alvo`);
  if (f.invertBuffs) out.push('inverte reforços');
  if (f.extend) out.push(`prolonga status em ${f.extend}t`);
  if (f.corpse) out.push('mira um corpo caído');
  if (f.pending) out.push(`${f.pending.delay ? `age após ${f.pending.delay} rodada(s)` : 'age já'}${f.pending.repeat ? ` e repete ${f.pending.repeat}×` : ''}`);
  if (f.wall) out.push(`ergue parede de ${f.wall}`);
  if (f.destroyProps) out.push('destrói obstáculos');
  if (f.trap) out.push(`${f.trap.count ? `${f.trap.count} ` : ''}armadilha${f.trap.status ? `: ${st(f.trap.status)}` : ''}${f.trap.damage ? ` · ${f.trap.damage} de dano` : ''}${f.trap.radius ? ` · raio ${f.trap.radius}` : ''}`);
  if (f.swap) out.push('troca de lugar com o alvo');
  if (f.extraTurn) out.push('ação extra');
  if (f.gaugeShift) out.push('mexe na fila de turnos');
  if (f.rewind) out.push('volta o alvo no tempo');
  if (f.imbue) out.push(`arma encantada ${f.imbue.turns}t${f.imbue.status ? `: ${st(f.imbue.status)}` : ''}${f.imbue.element ? ` · ${f.imbue.element}` : ''}${f.imbue.magic ? ' · dano mágico' : ''}${f.imbue.push ? ` · empurra ${f.imbue.push}` : ''}`);
  if (f.spendAllMp) out.push('gasta todo o MP');
  if (f.reduceCooldowns) out.push(`−${f.reduceCooldowns} nas recargas`);
  if (f.commandSummons) out.push('invocações agem já');
  if (f.sacrifice) out.push('detona uma invocação');
  if (f.perTile) out.push(`+${pct(f.perTile)} de dano por metro de distância`);
  if (f.through) out.push('atravessa inimigos');
  if (f.vortex) out.push(`puxa ${f.vortex} m para o centro`);
  if (f.homing) out.push('ignora cobertura e não erra');
  if (f.currentHpPct) out.push(`+${pct(f.currentHpPct)} da vida atual do alvo`);
  if (f.triggerTraps) out.push('detona suas armadilhas');
  if (f.clearTraps) out.push('desarma armadilhas inimigas');
  if (f.allyShield) out.push(`escudo de ${pct(f.allyShield)} no aliado mais próximo`);
  if (f.burstAround) out.push(`explosão ao redor ${f.burstAround.around === 'self' ? 'de si' : 'do alvo'}${f.burstAround.push ? ` · empurra ${f.burstAround.push} m` : ''}`);
  if (f.senseStatus) out.push(`fica veloz se algum inimigo tiver ${f.senseStatus}`);
  if (f.moveBonus) out.push(`+${f.moveBonus} m de deslocamento`);
  if (f.physBoost) out.push(`+${pct(f.physBoost)} de dano físico`);
  if (f.magicBoost) out.push(`+${pct(f.magicBoost)} de dano mágico`);
  if (f.freeHide) out.push(`esconder-se é ação livre ${f.freeHide}× por batalha`);
  if (f.steadyAim) out.push(`+${f.steadyAim} de acerto sem se mover no turno`);
  if (f.massBoost) out.push(`gravitacionais +${pct(f.massBoost)} de dano por inimigo extra na zona`);
  if (f.healBoost) out.push(`curas +${pct(f.healBoost)}${f.when ? ` ${COND[f.when] ?? f.when}` : ''}`);
  if (f.intercept) out.push(`assume ${pct(f.intercept.pct)} do dano de aliados a ${f.intercept.radius} m`);
  if (f.elementLifesteal) out.push(`rouba ${pct(f.elementLifesteal.pct)} do dano de ${f.elementLifesteal.element}`);
  if (f.trapRefund) out.push(`+${f.trapRefund} MP quando uma armadilha dispara`);
  if (f.critDamage) out.push(`+${pct(f.critDamage)} dano crítico`);
  if (f.onCritReset) out.push(`crítico zera a recarga de ${f.onCritReset}`);
  if (f.onCritSelf) out.push(`crítico: ${st(f.onCritSelf)}`);
  if (f.onKill) out.push(`ao abater:${f.onKill.healPct ? ` cura ${pct(f.onKill.healPct)}` : ''}${f.onKill.status ? ` ${st(f.onKill.status)}` : ''}${f.onKill.hide ? ' some nas sombras' : ''}`);
  if (f.onAnyDeath) out.push(`quando um inimigo cai: ${f.onAnyDeath.healPct ? `cura ${pct(f.onAnyDeath.healPct)}` : ''}${f.onAnyDeath.mpPct ? ` MP ${pct(f.onAnyDeath.mpPct)}` : ''}`);
  if (f.onHitCooldown) out.push(`ao apanhar, −${f.onHitCooldown} nas recargas`);
  if (f.onCastSelf) out.push(`ao usar ${f.onCastSelf.node ?? 'habilidade'}: ${st(f.onCastSelf.status)}`);
  if (f.elementBoost) out.push(`+${pct(f.elementBoost.mult - 1)} dano ${f.elementBoost.element ? `de ${f.elementBoost.element}` : 'elemental'}${f.when ? ` ${COND[f.when] ?? f.when}` : ''}`);
  if (f.mpDiscount) out.push(`−${pct(f.mpDiscount.pct)} MP${f.mpDiscount.node ? ` em ${f.mpDiscount.node}` : ''}`);
  if (f.mpRegen) out.push(`recupera ${pct(f.mpRegen)} MP/turno${f.when ? ` ${COND[f.when] ?? f.when}` : ''}`);
  if (f.shareWithSummons) out.push(`${pct(f.shareWithSummons)} do dano vai para a invocação`);
  if (f.cheatDeath) out.push('sobrevive a 1 golpe fatal');
  if (f.summonPower) out.push(`invocações +${pct(f.summonPower)} dano`);
  if (f.summonLifelink) out.push(`cura ${pct(f.summonLifelink)} do dano das invocações`);
  if (f.silentStrike) out.push('golpe pelas costas não revela');
  if (f.special) out.push(`mecânica: ${f.special}`);
  return out;
}

/** Efeitos extras das reações reforçadas (regra de reação única). */
function reactionExtras(r: FxReaction): string[] {
  const out: string[] = [];
  if (r.foe?.length) out.push(r.foe.map(st).join(' · '));
  if (r.crit) out.push('contra-ataque crítico');
  if (r.hits && r.hits > 1) out.push(`${r.hits} golpes`);
  if (r.reflectMult && r.reflectMult !== 1) out.push(`reflete ×${r.reflectMult}`);
  if (r.self?.length) out.push(`em si: ${r.self.map(st).join(', ')}`);
  if (r.hide) out.push('fica invisível');
  if (r.prime) out.push('próximo golpe crítico e silencia');
  if (r.store) out.push(`guarda ${pct(r.store)} do dano para o próximo golpe`);
  if (r.area) out.push(`área raio ${r.area.radius}${r.area.status ? ` · ${st(r.area.status)}` : ''}${r.area.push ? ` · empurra ${r.area.push} m` : ''}`);
  if (r.clone) out.push('deixa um clone');
  if (r.convert) out.push('toma a invocação');
  if (r.selfMp) out.push(`+${pct(r.selfMp)} MP`);
  if (r.resetSkill) out.push('zera a recarga da suprema');
  if (r.teamShield) out.push(`escudo de ${pct(r.teamShield)} no grupo`);
  if (r.reveal) out.push('revela invisíveis');
  if (r.command) out.push('invocações agem');
  return out;
}

export function describeSkill(s: CreatureSkill): string {
  const parts: string[] = [KIND_LABEL[s.kind]];
  if (s.kind === 'reaction' && s.react) {
    const r = s.react;
    parts.push(
      `ao sofrer ${REACT_ON[r.on]}: ${REACT_DO[r.do]}${r.reduce ? ` ${pct(r.reduce)}` : ''}${r.chance && r.chance < 100 ? ` (${r.chance}%)` : ''}${r.status ? ` · ${st(r.status)}` : ''}${r.damage ? ` · ${r.damage} de dano` : ''}${r.distance ? ` · recua ${r.distance} m` : ''}${r.push ? ` · empurra ${r.push} m` : ''}${r.healPct ? ` · cura ${pct(r.healPct)} do dano` : ''}${r.once ? ' · 1× por batalha' : ''}`,
    );
    parts.push(...reactionExtras(r));
  }
  if (s.power) parts.push(`poder ${s.power}`);
  if (s.scaling) parts.push(`escala ${Object.entries(s.scaling).filter(([, v]) => v).map(([k, v]) => `${ATTR_SHORT[k as keyof typeof ATTR_SHORT]} ×${v}`).join(' + ')}`);
  if (s.timeMult && s.timeMult !== 1) parts.push(`tempo ×${s.timeMult}`);
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
