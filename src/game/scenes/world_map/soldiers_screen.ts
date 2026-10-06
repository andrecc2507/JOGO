import { btn, clear, h, modal } from '@ui/dom';
import { DB } from '../../data';
import { derive, xpToNext, type Character } from '../../rules/character';
import { buildLabel } from '../../rules/skill_tree';
import { squadOfChar, type Campaign } from '../../world/campaign';
import { openEvolve } from '../shared/evolve_screen';
import { openBarracks } from './barracks_screen';

/** Heróis com pontos para distribuir (para o selo do menu). */
export function pendingPoints(c: Campaign): Character[] {
  return Object.values(c.roster).filter((ch) => ch.statPoints > 0 || ch.skillPoints > 0);
}

/**
 * Todos os soldados numa lista só: onde estão, vida, ferimentos e quem tem pontos para distribuir
 * (primeiro na lista, com o selo). Daqui se abre a evolução (atributos e teia) ou a ficha completa.
 */
export function openSoldiers(c: Campaign, onChange: () => void): void {
  modal('👥 Soldados', (body) => {
    const render = () => {
      clear(body);
      const all = Object.values(c.roster).sort((a, b) => Number(b.statPoints + b.skillPoints > 0) - Number(a.statPoints + a.skillPoints > 0) || b.level - a.level);
      const pend = pendingPoints(c).length;
      body.append(h('div', { class: pend ? 'gold' : 'muted', style: 'margin-bottom:6px', text: pend ? `${pend} soldado(s) com pontos para distribuir.` : 'Ninguém com pontos pendentes.' }));
      const table = h('table', { class: 'stats', style: 'width:100%' },
        h('tr', {}, ...['Soldado', 'Classe · caminho', 'Nv', 'Vida', 'Onde', 'Pontos', ''].map((t) => h('th', { style: 'text-align:left', text: t }))),
      );
      for (const ch of all) {
        const s = squadOfChar(c, ch.id);
        const d = derive(ch);
        const pts = [ch.statPoints ? `${ch.statPoints} atrib.` : '', ch.skillPoints ? `${ch.skillPoints} hab.` : ''].filter(Boolean).join(' · ');
        table.append(
          h('tr', {},
            h('td', {}, h('b', { text: ch.name }), ch.storyId ? h('span', { class: 'gold', text: ' ★' }) : ''),
            h('td', { class: 'muted', text: `${DB.classes[ch.classId]?.name ?? ch.classId} · ${buildLabel(ch)}` }),
            h('td', { text: `${ch.level}`, title: `XP ${ch.xp}/${xpToNext(ch.level)}` }),
            h('td', { style: ch.woundDays > 0 ? 'color:#e57373' : '', text: `${ch.hp}/${d.maxHp}${ch.woundDays > 0 ? ` · ${ch.severeWound ? 'grave' : 'ferido'} ${ch.woundDays}d` : ''}` }),
            h('td', { class: 'muted', text: s ? `${s.escort?.includes(ch.id) ? 'escolta de ' : ''}${s.name}` : 'reserva' }),
            h('td', {}, pts ? h('span', { class: 'badge up', text: `● ${pts}` }) : h('span', { class: 'muted', text: '—' })),
            h('td', { style: 'white-space:nowrap' },
              btn(pts ? '✦ Distribuir' : '✦ Evoluir', () => openEvolve(ch, render, all), { class: `small ${pts ? 'primary' : ''}` }),
              btn('Ficha', () => openBarracks(c, render, ch.id), { class: 'small' }),
            ),
          ),
        );
      }
      body.append(table);
      onChange();
    };
    render();
  }, { wide: true, onClose: onChange });
}
