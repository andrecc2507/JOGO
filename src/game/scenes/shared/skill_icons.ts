import type { CreatureSkill } from '../../data';

/**
 * Ícones das habilidades (traço de nanquim, caixa 24×24): o elemento manda no desenho (chama,
 * floco, raio, gota…); sem elemento, o tipo (espada, flecha, estrela, cruz…). Um selo pequeno no
 * canto mostra a forma (área, cone, linha).
 */
export interface SkillIcon {
  /** Caminhos traçados. */
  stroke: string[];
  /** Caminhos preenchidos. */
  fill: string[];
  /** Selo de forma: área, cone, linha ou nenhum. */
  badge: 'radius' | 'cone' | 'line' | null;
}

const KIND: Record<string, { stroke?: string[]; fill?: string[] }> = {
  physical: { stroke: ['M5 19L18 6', 'M18 6L20.5 3.5L20.5 7', 'M8.5 12.5L11.5 15.5', 'M3.5 20.5L6 18'] },
  ranged: { stroke: ['M4 20L20 4', 'M20 4L14.5 5M20 4L19 9.5', 'M4 20L5 15M4 20L9 19'] },
  magic: { fill: ['M12 2.5L14.6 9.2L21.5 9.6L16.2 14L17.9 21L12 17.2L6.1 21L7.8 14L2.5 9.6L9.4 9.2Z'] },
  heal: { fill: ['M9.5 3.5H14.5V9.5H20.5V14.5H14.5V20.5H9.5V14.5H3.5V9.5H9.5Z'] },
  buff: { stroke: ['M5 13L12 6L19 13', 'M5 19L12 12L19 19'] },
  utility: { stroke: ['M2.5 12C6 6.5 18 6.5 21.5 12C18 17.5 6 17.5 2.5 12Z'], fill: ['M12 9A3 3 0 1 1 12 15A3 3 0 1 1 12 9Z'] },
  summon: { fill: ['M12 13C15.5 13 18 15.5 18 18.5C18 20 16.5 20.5 12 20.5C7.5 20.5 6 20 6 18.5C6 15.5 8.5 13 12 13Z', 'M5 7.5A2.2 2.2 0 1 1 5 11.9A2.2 2.2 0 1 1 5 7.5Z', 'M19 7.5A2.2 2.2 0 1 1 19 11.9A2.2 2.2 0 1 1 19 7.5Z', 'M9 3.5A2.2 2.2 0 1 1 9 7.9A2.2 2.2 0 1 1 9 3.5Z', 'M15 3.5A2.2 2.2 0 1 1 15 7.9A2.2 2.2 0 1 1 15 3.5Z'] },
  passive: { fill: ['M12 2.5L21.5 12L12 21.5L2.5 12Z'] },
  reaction: { stroke: ['M18.5 8.5A7.5 7.5 0 1 0 19.5 13.5', 'M19 3.5V8.8H13.7'] },
};

const ELEMENT: Record<string, { stroke?: string[]; fill?: string[] }> = {
  fogo: { fill: ['M12 2.5C15.5 8 18.5 10.5 18.5 14.5A6.5 6.5 0 0 1 5.5 14.5C5.5 11.5 7.5 9.5 8.8 7.2C9.8 10 10.8 11.2 12 11.4C12.2 8.5 11 6 12 2.5Z'] },
  gelo: { stroke: ['M12 2.5V21.5', 'M3.8 7.2L20.2 16.8', 'M3.8 16.8L20.2 7.2', 'M9.5 4L12 6.5L14.5 4', 'M9.5 20L12 17.5L14.5 20'] },
  eletricidade: { fill: ['M13.5 2L5 13.5H11L9.8 22L19 9.5H13Z'] },
  agua: { fill: ['M12 2.5C16 8.5 18.5 11.5 18.5 15A6.5 6.5 0 0 1 5.5 15C5.5 11.5 8 8.5 12 2.5Z'] },
  terra: { fill: ['M2.5 19.5L9 8.5L13 14L16.5 9.5L21.5 19.5Z'] },
  vento: { stroke: ['M3 9H15A3 3 0 1 0 12 6', 'M3 13H18A3 3 0 1 1 15 16', 'M3 17H10'] },
  luz: { fill: ['M12 7.5A4.5 4.5 0 1 1 12 16.5A4.5 4.5 0 1 1 12 7.5Z'], stroke: ['M12 2V5', 'M12 19V22', 'M2 12H5', 'M19 12H22', 'M4.9 4.9L7 7', 'M17 17L19.1 19.1', 'M4.9 19.1L7 17', 'M17 7L19.1 4.9'] },
  sombra: { fill: ['M15 2.5A9.5 9.5 0 1 0 21.5 15A7.5 7.5 0 1 1 15 2.5Z'] },
  veneno: { fill: ['M12 2.5C16 8.5 18.5 11.5 18.5 15A6.5 6.5 0 0 1 5.5 15C5.5 11.5 8 8.5 12 2.5Z'], stroke: ['M9.5 14.5H9.6', 'M14.5 14.5H14.6', 'M10 18H14'] },
};

export function skillIcon(s: Pick<CreatureSkill, 'kind' | 'element' | 'shape' | 'radius'>): SkillIcon {
  const pick = (s.element && ELEMENT[s.element]) || KIND[s.kind] || KIND.utility!;
  const badge = s.shape === 'cone' ? 'cone' : s.shape === 'line' ? 'line' : (s.radius ?? 0) > 0 ? 'radius' : null;
  return { stroke: pick.stroke ?? [], fill: pick.fill ?? [], badge };
}
