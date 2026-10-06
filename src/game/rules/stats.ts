import balance from '../data/balance.json';
import type { Attr, Attributes } from '../data';

/**
 * Matemática central de personagens e combate (pura). Inspirada no Ragnarok clássico, sem Sorte.
 * Nenhuma habilidade calcula atributos por conta própria: tudo passa por aqui. Os números ficam em
 * `data/balance.json` e as fórmulas estão explicadas em `docs/design/matematica.md`.
 */
export const BALANCE = balance;

/** Número finito e não negativo (protege as fórmulas de NaN, Infinity e valores negativos). */
function safe(v: number): number {
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ───────────────────────────── progressão ─────────────────────────────

export const MAX_LEVEL = balance.progression.maxLevel;
export const MAX_ATTR = balance.progression.maxAttribute;

/**
 * Pontos de atributo ao chegar no nível `level`: 3 + ⌊(nível + 2)/4⌋ (4 no nível 2, 18 no 60),
 * crescendo como no Ragnarok.
 */
export function attributePointsAt(level: number): number {
  const p = balance.progression.attributePointsPerLevel;
  return p.base + Math.floor((level + p.offset) / p.everyLevels);
}

/** Custo para subir um atributo que está em `value`: 2 até 10, 3 até 20 … 7 de 51 a 59 (Ragnarok). */
export function attributeCost(value: number): number {
  const c = balance.progression.attributeCost;
  return Math.floor((Math.max(1, value) - 1) / c.everyPoints) + c.base;
}

/** Custo para levar um atributo de `from` até `to`. */
export function attributeCostRange(from: number, to: number): number {
  let sum = 0;
  for (let v = from; v < to; v++) sum += attributeCost(v);
  return sum;
}

/**
 * Pontos de atributo de uma carreira inteira: o custo exato da build-alvo do nível 60
 * (60/50/40/30/10 partindo de 1 em cada) = 696.
 */
export const TOTAL_ATTRIBUTE_POINTS = balance.progression.targetBuild.reduce((sum, t) => sum + attributeCostRange(balance.progression.baseAttribute, t), 0);

/** Pontos do nível 1: o que sobra do total depois de todos os níveis ganhos (54). */
export const STARTING_ATTRIBUTE_POINTS = (() => {
  let gained = 0;
  for (let lv = 2; lv <= balance.progression.maxLevel; lv++) gained += attributePointsAt(lv);
  return TOTAL_ATTRIBUTE_POINTS - gained;
})();

/** Pontos de atributo acumulados até o nível `level` (iniciais + todos os níveis ganhos). */
export function totalAttributePoints(level: number): number {
  let sum = STARTING_ATTRIBUTE_POINTS;
  for (let lv = 2; lv <= Math.min(level, MAX_LEVEL); lv++) sum += attributePointsAt(lv);
  return sum;
}

/** Pontos de habilidade ganhos ao chegar no nível `level`: 1, mais 1 extra a cada 5 níveis (5, 10 … 60). */
export function skillPointsAt(level: number): number {
  const p = balance.progression;
  return p.skillPointsPerLevel + (level % p.bonusSkillPointEvery === 0 ? 1 : 0);
}

/**
 * Pontos de habilidade acumulados até o nível `level`: 1 inicial + 1 por nível + 1 a cada 5 níveis
 * = 72 no nível 60 — duas teias até a suprema (28 cada) e meia teia de outra (~14), ver
 * docs/design/arvores_de_habilidades.md.
 */
export function totalSkillPoints(level: number): number {
  let sum = balance.progression.startingSkillPoints;
  for (let lv = 2; lv <= Math.min(level, MAX_LEVEL); lv++) sum += skillPointsAt(lv);
  return sum;
}

/**
 * Nível mínimo da habilidade anterior da teia para aprender a de posição `index` (0 = 1ª):
 * 1, 2, 2, 3, 3, 3, 4, 4, 5 — a curva que faz a linha reta até a suprema custar 28 pontos.
 */
export function chainRankReq(index: number): number {
  const r = balance.progression.chainRankReq;
  return r[Math.max(0, Math.min(r.length - 1, index))] ?? 1;
}

/** XP para ir do nível `level` ao próximo. */
export function xpToNext(level: number): number {
  const x = balance.progression.xpToNext;
  return Math.round(x.base * Math.pow(Math.max(1, level), x.exponent));
}

// ───────────────────────────── atributos → derivados ─────────────────────────────

/** Poder de um atributo: valor + ⌊valor/10⌋² (FOR → físico, DES → arcos, INT → mágico). */
export function attrPower(value: number): number {
  const v = safe(value);
  return v + Math.floor(v / balance.power.softStep) ** 2;
}

export function physicalPower(attrs: Attributes, attackAttr: Attr = 'str'): number {
  return attrPower(attrs[attackAttr]);
}

export function magicPower(attrs: Attributes): number {
  return attrPower(attrs.int);
}

// ───────────────────────── regra dos 5 golpes ─────────────────────────
//
// Âncora de todo o balanceamento: com atributos iguais, o ataque básico de um lado tira 1/5 da vida
// do outro. Ex.: FOR 1 contra VIT 1, no mesmo nível, arma de referência e sem armadura → 5 golpes.
//   ataque  = arma + poder(atributo de ataque) + bônus de nível
//   vida    = fator da classe × 5 × (arma de referência + poder(VIT) + bônus de nível)
// Com FOR = VIT, arma = arma de referência e fator 1, vida ÷ ataque = 5 exatamente. Armadura,
// fator de classe, especialização (FOR alta contra VIT baixa) e habilidades mexem a partir daí.

/** Bônus de nível no ataque (físico e mágico) e na vida: ⌊nível × 1⌋ (como o nível no ATK do Ragnarok). */
export function levelAttack(level: number): number {
  return Math.floor(safe(level) * balance.attack.levelBonus);
}

/** Ataque da arma "esperada" para o nível (7 no nível 1, 19 no 60): a régua da vida. */
export function referenceWeapon(level: number): number {
  const w = balance.attack.referenceWeapon;
  return Math.round(w.base + safe(level) * w.perLevel);
}

/** Golpes básicos que a vida aguenta de um atacante igual (atributo de ataque = VIT). */
export const HITS_TO_KILL = balance.hp.hitsToKill;

/** Vida máxima: fator da classe × 5 × (arma de referência do nível + poder(VIT) + bônus de nível). */
export function maxHp(factor: number, level: number, vit: number): number {
  return Math.max(1, Math.round(safe(factor) * HITS_TO_KILL * (referenceWeapon(level) + attrPower(vit) + levelAttack(level))));
}

/** MP máximo: (base da classe + nível × crescimento + extras) × (1 + INT × 2%). */
export function maxMp(base: number, perLevel: number, level: number, int: number, extra = 0): number {
  return Math.round((safe(base) + safe(level) * safe(perLevel) + safe(extra)) * (1 + safe(int) * balance.mp.intPct));
}

/** Precisão (HIT do Ragnarok): nível + DES + bônus. */
export function accuracy(level: number, dex: number, bonus = 0): number {
  return safe(level) + safe(dex) + bonus;
}

/** Esquiva (FLEE sem AGI): nível + VEL/3 + DES/5 + bônus. */
export function evasion(level: number, spd: number, dex: number, bonus = 0): number {
  const e = balance.evasion;
  return safe(level) + Math.floor(safe(spd) / e.spdDiv) + Math.floor(safe(dex) / e.dexDiv) + bonus;
}

/**
 * Resistência física: só a armadura, com retorno decrescente — armadura / (armadura + 50), no máximo
 * 80%. A VIT já entra na vida (regra dos 5 golpes), então não reduz o dano de novo.
 */
export function physicalResistance(armor: number): number {
  const d = balance.defense;
  const a = safe(armor);
  return Math.min(d.maxReduction, a / (a + d.armorK));
}

/** Resistência mágica: INT / (INT + 150), limitada a 70%. */
export function magicResistance(int: number): number {
  const r = balance.magicResistance;
  const i = safe(int);
  return Math.min(r.max, i / (i + r.intK));
}

// ───────────────────────────── linha do tempo ─────────────────────────────

/**
 * Intervalo entre ações (segundos da linha do tempo): 450 / (VEL + 25). VEL 5 → 15 s, VEL 20 → 10 s.
 * PROVISÓRIO até a simulação de balanceamento.
 */
export function actionInterval(spd: number): number {
  const t = balance.timeline;
  return Math.max(t.minInterval, t.numerator / (safe(spd) + t.spdOffset));
}

export const ROUND_SECONDS = balance.timeline.roundSeconds;
/** Ritmo da tela: quantos segundos da linha do tempo passam por segundo real enquanto as barras enchem. */
export const BATTLE_TIME_SCALE = balance.timeline.battleSecondsPerRealSecond;

// ───────────────────────────── acerto e dano ─────────────────────────────

/** Chance (%) de acerto físico: 80 + Precisão − Esquiva + modificadores, entre 5 e 95. */
export function physicalHitChance(acc: number, eva: number, mods = 0): number {
  const h = balance.hit;
  return clamp(h.base + acc - eva + mods, h.min, h.max);
}

/** Chance (%) de acerto mágico: quase sempre acerta; só a esquiva de atributos (sem o nível) atrapalha. */
export function magicHitChance(evasionAttrs: number, accMods = 0, evaMods = 0): number {
  const m = balance.magicHit;
  return clamp(m.base - safe(evasionAttrs) * m.evasionWeight + accMods * m.accuracyWeight - evaMods * m.evasionWeight, m.min, m.max);
}

/**
 * Chance (%) de acerto quando fumaça ou vapor turvam o tiro (no caminho ou em volta do alvo).
 * Vale para golpes físicos e mágicos; quem está lado a lado não sofre a penalidade.
 */
export function obscuredHitChance(chance: number): number {
  const h = balance.hit;
  return Math.max(h.min, chance - h.obscuredPenalty);
}

/** Multiplicador de habilidade pelo poder da ficha: poder 0 = ataque básico (×1), cada ponto +10%. */
export function skillMultiplier(power: number): number {
  return 1 + safe(power) * balance.skill.powerStep;
}

/** Poder bruto: base (arma) + Σ poder do atributo × peso + bônus de nível. */
export function rawPower(base: number, attrs: Attributes, scaling: Partial<Record<Attr, number>>, level = 0): number {
  let sum = safe(base) + levelAttack(level);
  for (const [k, w] of Object.entries(scaling) as [Attr, number][]) sum += attrPower(attrs[k]) * (w ?? 0);
  return sum;
}

/**
 * Cura de uma habilidade: ((Σ poder(atributo) × peso + bônus de nível) × 0,6 + bônus de cura) ×
 * multiplicador da habilidade. Peso padrão INT 1 (a teia pode trocar: Defensor INT 0,6 + VIT 0,6).
 */
export function healPower(attrs: Attributes, healBonus: number, power: number, level = 0, scaling: Partial<Record<Attr, number>> = { int: 1 }): number {
  return Math.max(1, Math.round((rawPower(0, attrs, scaling, level) * balance.skill.heal.intWeight + safe(healBonus)) * skillMultiplier(power)));
}

/** A magia usa a arma? Sim com varinha/bastão, ou quando a escala mistura FOR/DES (lâmina arcana, flecha rúnica). */
export function magicUsesWeapon(weaponType: string, scaling?: Partial<Record<Attr, number>>): boolean {
  return weaponType === 'varinha' || weaponType === 'bastao' || !!(scaling && ((scaling.str ?? 0) > 0 || (scaling.dex ?? 0) > 0));
}

/**
 * Dias de ferimento depois da batalha: só quem chegou abaixo de 50% da vida em algum momento
 * (mesmo curado depois). Dias = ⌈(1 − menor fração de vida) × 6⌉ → 3 dias a 50%, 6 dias perto de 0.
 */
export function woundDays(lowestHpFraction: number): number {
  const w = balance.wounds;
  const f = clamp(Number.isFinite(lowestHpFraction) ? lowestHpFraction : 1, 0, 1);
  if (f >= w.threshold) return 0;
  return Math.max(1, Math.ceil((1 - f) * w.daysAtZero));
}

/**
 * Ferimento grave: terminar a luta com menos de 10% da vida. O grave não luta (nem se o esquadrão
 * for atacado na estrada) até sarar; o leve luta, mas com a vida máxima reduzida (`woundHpMult`).
 */
export function severeWound(endHpFraction: number): boolean {
  return (Number.isFinite(endHpFraction) ? endHpFraction : 1) < balance.wounds.severeBelow;
}

/** Vida máxima de quem luta ferido (ferimento leve). */
export function woundHpMult(): number {
  return balance.wounds.lightHpMult;
}

/** Dano em objetos (coberturas): poder bruto × multiplicador da habilidade, sem esquiva nem resistência. */
export function structureDamage(raw: number, power: number): number {
  return Math.max(1, Math.round(safe(raw) * skillMultiplier(power)));
}

/**
 * Queda de altura (pulo de telhado, chão que desaba): 6% da vida máxima por nível além do que o
 * salto aguenta (salto + 1). Voando não sofre.
 */
export function fallDamage(maxHp: number, levels: number, jump: number): number {
  const extra = Math.floor(safe(levels)) - (Math.floor(safe(jump)) + 1);
  if (extra <= 0) return 0;
  return Math.max(1, Math.round(safe(maxHp) * balance.collapse.fallPctPerLevel * extra));
}

/** Esmagado por escombros: 25% da vida máxima + 4 por nível de espessura do que caiu em cima. */
export function crushDamage(maxHp: number, thickness: number): number {
  return Math.max(1, Math.round(safe(maxHp) * balance.collapse.crushPct + balance.collapse.crushPerLevel * safe(thickness)));
}

/**
 * Luz à noite: fogo, brasas, lampiões e cristais iluminam `radius` casas em volta (fogueira e
 * lampião, `bigRadius`); casas iluminadas são vistas de até `visionRange` de distância (com linha de
 * visão). Tiro no chão (sem alvo, sem rolar acerto) alcança `groundAimRangeBonus` casas a mais;
 * fogo em chão que não pega deixa brasas por `emberTurns` turnos.
 */
export const LIGHT = balance.light;

/** Números das mecânicas táticas (empurrar, arremessar, supressão, furtividade, concentração…). */
export const TACTICS = balance.tactics;

/**
 * Empurrar (Força × Força): 50% + 4 por ponto de FOR a mais que o alvo + 20 por tamanho a mais;
 * entre 5% e 95%. Quem tem 12+ de FOR a mais empurra 2 casas.
 */
export function shoveChance(aStr: number, dStr: number, sizeDiff = 0): number {
  const t = balance.tactics;
  return clamp(Math.round(t.shoveBase + t.shovePerStr * (safe(aStr) - safe(dStr)) + t.shovePerSize * sizeDiff), t.shoveMin, t.shoveMax);
}

export function shoveDistance(aStr: number, dStr: number): number {
  return safe(aStr) - safe(dStr) >= balance.tactics.shoveFarMargin ? 2 : 1;
}

/** Bater numa parede ou em alguém ao ser empurrado: 6% da vida máxima. */
export function collideDamage(maxHp: number): number {
  return Math.max(1, Math.round(safe(maxHp) * balance.tactics.collidePct));
}

/** Alcance do arremesso de objeto: 2 + 1 a cada 10 de FOR. */
export function throwRange(str: number): number {
  return balance.tactics.throwBaseRange + Math.floor(safe(str) / balance.tactics.throwStrPerTile);
}

/** Chance de perceber uma armadilha inimiga perto (por turno): 15% + DES + INT. */
export function perceiveChance(dex: number, int: number): number {
  const t = balance.tactics;
  return clamp(t.perceiveBase + t.perceivePerAttr * (safe(dex) + safe(int)), 0, 95);
}

/** Arrombar fechadura: 20% + 2 por ponto do maior entre DES e FOR. */
export function lockpickChance(dex: number, str: number): number {
  const t = balance.tactics;
  return clamp(t.lockpickBase + t.lockpickPerAttr * Math.max(safe(dex), safe(str)), 5, 95);
}

/**
 * Manter a concentração ao sofrer dano: 70% + VIT + INT − 0,6 por ponto percentual da vida máxima
 * que o golpe tirou; entre 5% e 95%.
 */
export function concentrationChance(vit: number, int: number, damage: number, maxHp: number): number {
  const t = balance.tactics;
  const pct = (100 * safe(damage)) / Math.max(1, safe(maxHp));
  return clamp(Math.round(t.concentrationBase + t.concentrationPerAttr * (safe(vit) + safe(int)) - t.concentrationPerDamagePct * pct), 5, 95);
}

/** Vantagem (rola duas vezes, fica com a melhor) e desvantagem (fica com a pior). */
export function advantageChance(chance: number, adv: number): number {
  const p = clamp(safe(chance), 0, 100) / 100;
  if (adv > 0) return Math.round(100 * (1 - (1 - p) * (1 - p)));
  if (adv < 0) return Math.round(100 * p * p);
  return Math.round(100 * p);
}

/** Habilidades de área (explosões) castigam paredes mais que golpes comuns. */
export const BLAST_STRUCTURE_MULT = balance.collapse.blastStructureMult;

export const CRIT_MULT = balance.critical.multiplier;

/** Fogo amigo: habilidades de área (raio, cone, linha) atingem aliados também (nunca quem lançou). */
export const FRIENDLY_FIRE = balance.rules.friendlyFire;

/** Até este nível o esquadrão é novato: encontros menores, sem emboscada e humanos sem habilidades de teia. */
export const NOVICE_LEVEL = balance.encounters.noviceLevel;

/**
 * Nível do encontro relativo à média do grupo: a maioria mais fraca (−3 a −2), uma parte um pouco
 * mais fraca (−1), outra parte no mesmo nível e uma chance pequena de ser mais forte (+1 a +2).
 * `roll` é um número em [0, 1); `pick` sorteia o deslocamento dentro da faixa.
 */
export function encounterLevelOffset(roll: number, pick: (min: number, max: number) => number): number {
  let r = roll;
  for (const b of balance.encounters.levelBands) {
    if (r < b.chance) return pick(b.min, b.max);
    r -= b.chance;
  }
  return 0;
}

// ───────────────────────────── refino ─────────────────────────────

/**
 * Atributos de um item refinado de +0 para `level` (Bastiamar: armas e armaduras; Cristália:
 * itens mágicos). Arma: ataque × (1 + 10% por nível); armadura/escudo: defesa × (1 + 12% por
 * nível), no mínimo +1 por nível; mágico: +1 em cada bônus de atributo por nível.
 */
export function refinedStats(
  base: { atk?: number; def?: number; bonus?: Record<string, number | undefined> },
  level: number,
  magic: boolean,
): { atk?: number; def?: number; bonus?: Record<string, number> } {
  const r = balance.refine;
  const n = clamp(Math.floor(safe(level)), 0, 99);
  const out: { atk?: number; def?: number; bonus?: Record<string, number> } = {};
  if (base.atk !== undefined) out.atk = magic ? base.atk : Math.round(base.atk * (1 + r.weaponAtk * n));
  if (base.def !== undefined) out.def = magic ? base.def : Math.max(base.def + n, Math.round(base.def * (1 + r.armorDef * n)));
  if (base.bonus) {
    out.bonus = {};
    for (const [k, v] of Object.entries(base.bonus)) if (v !== undefined) out.bonus[k] = magic && v > 0 ? v + r.attrPerLevel * n : v;
  }
  return out;
}

/**
 * Teste de atributo fora da batalha (eventos de viagem, C17): 50% quando o melhor atributo do
 * esquadrão empata com a meta (10 + 0,6 por nível + dificuldade do evento); ±4 por ponto de
 * diferença; entre 10% e 95%.
 */
export function travelCheckChance(best: number, level: number, difficulty = 0): number {
  const t = balance.travel;
  const target = t.checkBase + t.checkPerLevel * safe(level) + difficulty;
  return clamp(50 + t.checkPerPoint * (safe(best) - target), t.checkMin, t.checkMax);
}
