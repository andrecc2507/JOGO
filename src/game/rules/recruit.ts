import type { Rng } from '@core';
import { ATTRS, DB, type Attr, type Attributes, type ClassId } from '../data';
import {
  BASE_ATTR,
  DEFAULT_WEAPON,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  STARTING_POINTS,
  STARTING_SKILL_POINTS,
  autoAllocate,
  emptyAttrs,
  fullHeal,
  gainXp,
  statCost,
  xpToNext,
  type Character,
} from './character';

const FIRST_NAMES = [
  'Alric', 'Bran', 'Cael', 'Dara', 'Edda', 'Faelan', 'Gwen', 'Hask', 'Iria', 'Joran', 'Kaela', 'Lorn', 'Mira', 'Nessa',
  'Orin', 'Pell', 'Quen', 'Rhea', 'Soren', 'Tamsin', 'Ulric', 'Vesna', 'Wren', 'Yara', 'Zed', 'Aurel', 'Brisa', 'Cora',
  'Davi', 'Elara', 'Fausto', 'Greta', 'Hugo', 'Isolde', 'Jonas', 'Lia', 'Marek', 'Nilo', 'Otto', 'Petra', 'Rurik', 'Selma',
];
const EPITHETS = ['', '', '', ' do Vale', ' da Colina', ' o Ruivo', ' Ferro-velho', ' das Cinzas', ' Pé-leve', ' o Jovem'];

export function randomName(rng: Rng): string {
  return rng.pick(FIRST_NAMES) + rng.pick(EPITHETS);
}

export function randomAppearance(rng: Rng) {
  return {
    hairStyle: rng.int(0, HAIR_STYLES - 1),
    hairColor: rng.pick(HAIR_COLORS),
    skin: rng.pick(SKIN_TONES),
  };
}

let idCounter = 0;
export function newId(prefix: string, rng: Rng): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rng.int(0, 1295).toString(36)}`;
}

/** Distribui pontos iniciais com pesos. Aprendizes recebem um atributo "vocação" aleatório. */
function startingAttrs(rng: Rng, weights: Partial<Attributes>): { attrs: Attributes; points: number } {
  const attrs = emptyAttrs(BASE_ATTR);
  const pool: Attr[] = ATTRS.flatMap((a) => Array<Attr>(1 + Math.round((weights[a] ?? 0) * 1.5)).fill(a));
  // Os pontos iniciais pagam o custo normal (2 por ponto nesta faixa); a sobra fica guardada.
  let points = STARTING_POINTS;
  for (let guard = 0; guard < 500; guard++) {
    const a = rng.pick(pool);
    const cost = statCost(attrs[a]);
    if (cost > points) break;
    attrs[a] += 1;
    points -= cost;
  }
  return { attrs, points };
}

export interface MakeCharacterOptions {
  classId: ClassId;
  level?: number;
  name?: string;
  /** Pesos extras de distribuição (sobrepõe o viés da classe). */
  weights?: Partial<Attributes>;
}

export function makeCharacter(rng: Rng, opts: MakeCharacterOptions): Character {
  const cls = DB.classes[opts.classId];
  let weights: Partial<Attributes> = opts.weights ?? cls.bias;
  if (opts.classId === 'aprendiz' && !opts.weights) {
    // Vocação: um atributo recebe peso alto e sugere uma classe.
    weights = { [rng.pick(ATTRS)]: 4, [rng.pick(ATTRS)]: 2 };
  }
  const start = startingAttrs(rng, weights);
  const c: Character = {
    id: newId('char', rng),
    name: opts.name ?? randomName(rng),
    classId: opts.classId,
    level: 1,
    xp: 0,
    attrs: start.attrs,
    statPoints: start.points,
    skillPoints: 0,
    skills: [],
    hp: 1,
    mp: 0,
    woundDays: 0,
    equipment: { weapon: DEFAULT_WEAPON[opts.classId], offhand: null, armor: null, accessory: null, utility: [null, null, null] },
    appearance: randomAppearance(rng),
    kills: 0,
  };
  // Todo recruta chega com um ponto de habilidade (1 + 1 por nível = 60 no nível 60); o Aprendiz guarda o seu até a promoção.
  c.skillPoints += STARTING_SKILL_POINTS;
  const level = Math.max(1, opts.level ?? 1);
  while (c.level < level) gainXp(c, xpToNext(c.level) - c.xp);
  autoAllocate(c, weights, rng);
  fullHeal(c);
  return c;
}

/**
 * Personagem criado pelo jogador (Novo jogo): atributos na base e todos os pontos iniciais para
 * distribuir na tela de atributos. Nível 1, com o ponto de habilidade inicial.
 */
export function blankCharacter(rng: Rng, opts: { classId: ClassId; name: string; appearance?: Character['appearance'] }): Character {
  const c = makeCharacter(rng, { classId: opts.classId, name: opts.name });
  c.attrs = emptyAttrs(BASE_ATTR);
  c.statPoints = STARTING_POINTS;
  if (opts.appearance) c.appearance = { ...opts.appearance };
  fullHeal(c);
  return c;
}

/** Devolve os pontos de atributo gastos (para recomeçar a distribuição na criação). */
export function resetAttributes(c: Character): void {
  c.attrs = emptyAttrs(BASE_ATTR);
  c.statPoints = STARTING_POINTS;
  fullHeal(c);
}

export interface Candidate {
  character: Character;
  price: number;
}

export function recruitPrice(level: number, classId: ClassId): number {
  return 60 + level * 70 + (classId === 'aprendiz' ? 0 : 60);
}

/** Lista mensal de candidatos de uma capital: Aprendizes + recrutas da classe local. */
export function generateRecruitPool(rng: Rng, localClass: ClassId): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < 4; i++) {
    const c = makeCharacter(rng, { classId: 'aprendiz' });
    out.push({ character: c, price: recruitPrice(1, 'aprendiz') });
  }
  for (let i = 0; i < 3; i++) {
    const level = rng.int(1, 2);
    const c = makeCharacter(rng, { classId: localClass, level });
    out.push({ character: c, price: recruitPrice(level, localClass) });
  }
  return out;
}

/** Lista da Citadela Real: só Aprendizes (escolhem a classe ao passar do 1º nível). */
export function generateApprenticePool(rng: Rng, count = 6): Candidate[] {
  return Array.from({ length: count }, () => ({ character: makeCharacter(rng, { classId: 'aprendiz' }), price: recruitPrice(1, 'aprendiz') }));
}

/** Sugere a classe de um Aprendiz pelo maior atributo. */
export function suggestedClass(c: Character): ClassId {
  const top = ATTRS.reduce((a, b) => (c.attrs[a] >= c.attrs[b] ? a : b));
  const map: Record<Attr, ClassId> = { str: 'guerreiro', vit: 'guerreiro', dex: 'arqueiro', int: 'mago', spd: 'ladrao' };
  return map[top];
}
