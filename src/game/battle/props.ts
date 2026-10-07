import { PROPS, tileAt, type BattleMap } from './map';
import type { BattleState } from './types';
import { propBroke } from './tactics';

/**
 * Coberturas destrutíveis: árvores, rochas, muros, caixas… têm resistência (`PROPS[p].hp`).
 * Quebram com o ataque básico mirado nelas, com habilidades de área e com tiros que erram
 * um alvo protegido por elas.
 */

/** Resistência atual do objeto em (x, y), ou 0 se não há objeto. */
export function propHp(map: BattleMap, x: number, y: number): number {
  const t = tileAt(map, x, y);
  if (!t?.p) return 0;
  return t.pHp ?? PROPS[t.p].hp;
}

/** Tira `amount` da resistência do objeto; ao chegar a 0 ele some. Devolve true se quebrou. */
export function damageProp(state: BattleState, x: number, y: number, amount: number): boolean {
  const t = tileAt(state.map, x, y);
  if (!t?.p || amount <= 0) return false;
  const def = PROPS[t.p];
  const left = (t.pHp ?? def.hp) - amount;
  state.events.push({ type: 'fx', x, y, element: 'hit' });
  if (left > 0) {
    t.pHp = left;
    state.events.push({ type: 'text', x, y, text: `-${amount}`, color: '#bcaaa4' });
    return false;
  }
  const was = t.p;
  t.p = null;
  delete t.pHp;
  state.events.push({ type: 'text', x, y, text: `${def.name} quebrou!`, color: '#ffcc80' });
  state.log.push(`💥 ${def.name} quebrou — a cobertura acabou.`);
  // Barril de óleo derrama, de pólvora explode, lustre despenca.
  propBroke(state, x, y, was);
  return true;
}
