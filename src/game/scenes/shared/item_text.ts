import { ATTR_SHORT, type ItemDef } from '../../data';

const BONUS_LABEL: Record<string, string> = { crit: 'crítico', evasion: 'esquiva', accuracy: 'precisão', heal: 'cura' };
const WEAPON_LABEL: Record<string, string> = { espada: 'Espada', arco: 'Arco', varinha: 'Varinha', bastao: 'Bastão', faca: 'Faca', natural: 'Natural', besta_mao: 'Bestas de mão' };

/** Números de um item numa linha: "Espada · ATQ 13 · alcance 1 · +5 crítico · +3 FOR". */
export function itemStatLine(it: ItemDef): string {
  const parts: string[] = [];
  if (it.weaponType) parts.push(WEAPON_LABEL[it.weaponType] ?? it.weaponType);
  if (it.atk) parts.push(`ATQ ${it.atk}`);
  if (it.range) parts.push(`alcance ${it.range}`);
  if (it.def) parts.push(`DEF ${it.def}`);
  for (const [k, v] of Object.entries(it.bonus ?? {})) {
    if (!v) continue;
    const label = (ATTR_SHORT as Record<string, string>)[k] ?? BONUS_LABEL[k] ?? k;
    parts.push(`${v > 0 ? '+' : ''}${v} ${label}`);
  }
  const u = it.use;
  if (u) {
    if (u.heal) parts.push(`cura ${u.heal}`);
    if (u.mp) parts.push(`+${u.mp} MP`);
    if (u.throwElement) parts.push(`arremesso de ${u.throwElement}${u.radius ? ` (raio ${u.radius})` : ''}`);
    if (u.smoke) parts.push('fumaça');
    if (u.flash) parts.push('clarão');
    if (u.cure?.length) parts.push(`cura ${u.cure.join(', ')}`);
    if (u.torch) parts.push('tocha');
    if (u.placeProp) parts.push('coloca no chão');
  }
  if (it.uses && it.uses > 1) parts.push(`${it.uses} usos por batalha`);
  if (it.captureBonus) parts.push(`+${it.captureBonus}% para render`);
  return parts.join(' · ');
}

/** Soma dos bônus do que está equipado (para o resumo da ficha). */
export function equipmentTotals(items: ItemDef[]): string {
  const sum: Record<string, number> = {};
  for (const it of items) {
    if (it.def) sum.DEF = (sum.DEF ?? 0) + it.def;
    for (const [k, v] of Object.entries(it.bonus ?? {})) {
      const label = (ATTR_SHORT as Record<string, string>)[k] ?? BONUS_LABEL[k] ?? k;
      sum[label] = (sum[label] ?? 0) + (v ?? 0);
    }
  }
  const parts = Object.entries(sum).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`);
  return parts.length ? parts.join(' · ') : 'nenhum bônus';
}
