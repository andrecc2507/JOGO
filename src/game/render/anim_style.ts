import type { AnimStyle, Element, SkillDef, SkillFx } from '../data';

/** O que a escolha da animação precisa saber da habilidade (funciona com ataque básico, magia ou habilidade de árvore). */
export interface AnimSkill {
  id: string;
  kind: SkillDef['kind'] | 'summon';
  shape?: SkillDef['shape'];
  range: number;
  radius?: number;
  element?: Element;
  anim?: AnimStyle;
  fx?: SkillFx;
}

/** Quem age: muda o golpe básico (garra para feras, flecha ou orbe à distância). */
export interface AnimActor {
  beast: boolean;
  weaponRange: number;
  wand: boolean;
}

/** Estilos que nascem no atacante e viajam até o alvo. */
export const TRAVELING: ReadonlySet<AnimStyle> = new Set(['arrow', 'volley', 'orb', 'beam', 'bolt', 'dash', 'leap', 'thrust', 'cone']);

/** Estilos mágicos ganham a concentração de energia antes de soltar. */
export function isMagicStyle(style: AnimStyle): boolean {
  return ['orb', 'beam', 'bolt', 'nova', 'meteor', 'heal', 'buff', 'summon', 'charge'].includes(style);
}

/** Animação de uma ação: a da ficha, se houver; senão deduzida do tipo, formato e elemento. */
export function animFor(s: AnimSkill, actor: AnimActor): AnimStyle {
  if (s.anim) return s.anim;
  const fx = s.fx ?? {};
  if (s.id === 'ataque') {
    if (actor.weaponRange > 1) return actor.wand ? 'orb' : 'arrow';
    return actor.beast ? 'claw' : 'slash';
  }
  if (s.kind === 'heal' || fx.revive) return 'heal';
  if (s.kind === 'summon' || fx.summon) return 'summon';
  if (fx.trap) return 'trap';
  if (fx.teleport || fx.swap) return 'blink';
  if (fx.hide) return 'smoke';
  if (fx.leap) return 'leap';
  if (s.kind === 'buff') return 'buff';
  if (s.kind === 'utility') return s.shape === 'radius' && s.range === 0 ? 'shout' : 'buff';
  if (s.shape === 'cone') return 'cone';
  if (s.shape === 'line') return s.kind === 'magic' || s.range > 3 ? 'beam' : fx.through ? 'dash' : 'thrust';
  if (s.shape === 'radius' && (s.radius ?? 0) > 0) {
    if (s.kind === 'physical') return s.range <= 1 ? 'spin' : 'leap';
    if (s.kind === 'ranged') return 'volley';
    if (s.range === 0) return 'nova';
    return s.element === 'fogo' || s.element === 'terra' || s.element === 'luz' ? 'meteor' : 'nova';
  }
  if (s.kind === 'ranged') return fx.randomTargets ? 'volley' : 'arrow';
  if (s.kind === 'magic') return s.element === 'eletricidade' || s.element === 'luz' ? 'bolt' : 'orb';
  return actor.beast ? 'claw' : fx.randomTargets ? 'dash' : 'slash';
}

/** Velocidade da caminhada em tiles por segundo: mais VEL, mais rápido (só cosmético). */
export function moveSpeed(spd: number): number {
  return Math.max(3, Math.min(9, 3.5 + spd * 0.06));
}

/** Cor principal e clara de cada elemento (paleta viva, estilo SNES). */
export const ELEMENT_PALETTE: Record<Element | 'fisico' | 'cura' | 'apoio' | 'arcano', [string, string]> = {
  fogo: ['#ff6a1a', '#ffe08a'],
  agua: ['#3d8bff', '#bfe3ff'],
  gelo: ['#7fd8ff', '#ffffff'],
  eletricidade: ['#ffe94d', '#ffffff'],
  vento: ['#8affc1', '#eafff3'],
  terra: ['#b07a3c', '#f0d29a'],
  veneno: ['#8be04e', '#e6ff9e'],
  luz: ['#fff2a8', '#ffffff'],
  sombra: ['#8a4dff', '#e1c9ff'],
  fisico: ['#ffffff', '#fff7c2'],
  cura: ['#6dff9a', '#e8ffe8'],
  apoio: ['#ffd54f', '#fff8e1'],
  arcano: ['#b388ff', '#f3e5f5'],
};

export function paletteFor(s: Pick<AnimSkill, 'kind' | 'element'>): [string, string] {
  if (s.element) return ELEMENT_PALETTE[s.element];
  if (s.kind === 'heal') return ELEMENT_PALETTE.cura;
  if (s.kind === 'buff' || s.kind === 'utility' || s.kind === 'summon') return ELEMENT_PALETTE.apoio;
  if (s.kind === 'magic') return ELEMENT_PALETTE.arcano;
  return ELEMENT_PALETTE.fisico;
}
