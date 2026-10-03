import { clear, h, modal } from '@ui/dom';
import { ATTRS, ATTR_LABEL, DB } from '../../data';
import { describeSkill } from '../../bestiary/describe';
import { habitatLabel } from '../../world/regions';
import { RARITY_COLOR, RARITY_LABEL } from '../../world/encounters';
import { isStudied } from '../../world/base';
import { HUNTER_MARK, LORE, loreTier } from '../../world/capital_services';
import type { Campaign } from '../../world/campaign';

/**
 * Bestiário conhecido: só as bestas já abatidas. O que aparece de cada uma depende do conhecimento
 * registrado no Pavilhão dos Caçadores de Verdelume (ficha → atributos → habilidades → Marca).
 */
export function openKnownBestiary(c: Campaign): void {
  modal(
    '📖 Bestiário conhecido',
    (body) => {
      const known = Object.keys(c.speciesKills)
        .filter((id) => DB.creatures[id] && loreTier(c, id) > 0)
        .sort((a, b) => DB.creatures[a]!.name.localeCompare(DB.creatures[b]!.name));
      body.append(h('div', { class: 'muted', text: `${known.length} de ${Object.values(DB.creatures).filter((x) => !x.summonOnly).length} bestas conhecidas. Registre mais detalhes com os caçadores de Verdelume.` }));
      if (!known.length) {
        body.append(h('div', { class: 'muted', style: 'margin-top:8px', text: 'Abata uma besta para ela aparecer aqui.' }));
        return;
      }
      const list = h('div', { class: 'col', style: 'flex:0 0 220px;max-height:60vh;overflow:auto' });
      const detail = h('div', { class: 'col', style: 'flex:1;min-width:260px' });
      let sel = known[0]!;
      const show = () => {
        clear(list);
        for (const id of known) {
          const cr = DB.creatures[id]!;
          list.append(h('div', { class: `item ${id === sel ? 'selected' : ''}`, onClick: () => ((sel = id), show()) }, h('b', { text: cr.name, style: `color:${RARITY_COLOR[cr.rarity]}` }), h('span', { class: 'muted', text: ` · ${c.speciesKills[id]}×` })));
        }
        clear(detail);
        const cr = DB.creatures[sel]!;
        const tier = loreTier(c, sel);
        detail.append(
          h('h3', { class: 'gold', text: cr.name }),
          h('div', { class: 'muted', text: `${RARITY_LABEL[cr.rarity]} · Nv ${cr.levelMin}–${cr.levelMax} · ${habitatLabel(cr)} · ${c.speciesKills[sel]} abate(s)` }),
          h('div', { text: cr.description }),
        );
        if (isStudied(c, sel)) detail.append(h('div', { style: 'color:#4fc3f7', text: '📚 Estudada na Biblioteca: bônus de dano e acerto.' }));
        if (tier >= 2)
          detail.append(
            h('h3', { class: 'gold', style: 'margin-top:6px', text: 'Atributos' }),
            h('div', { text: `HP ${cr.hp} · Movimento ${cr.move} · Tamanho ${cr.size}${cr.fly ? ' · voa' : ''} · Elemento ${cr.element}` }),
            h('div', { class: 'muted', text: ATTRS.map((a) => `${ATTR_LABEL[a]} ${cr.attrs[a]}`).join(' · ') }),
          );
        if (tier >= 3) {
          detail.append(h('h3', { class: 'gold', style: 'margin-top:6px', text: 'Habilidades' }));
          for (const s of cr.skills) detail.append(h('div', { class: 'item', style: 'font-size:12px' }, h('b', { text: s.name }), h('span', { class: 'muted', text: ` — ${describeSkill(s)}` }), h('div', { text: s.description })));
        }
        if (tier >= 4) detail.append(h('div', { class: 'gold', style: 'margin-top:6px', text: `🏹 Marca do Caçador: +${Math.round(HUNTER_MARK.damage * 100)}% de dano e +${HUNTER_MARK.crit}% de crítico contra esta besta.` }));
        const next = LORE.find((t) => t.tier === tier + 1);
        if (next) detail.append(h('div', { class: 'muted', style: 'margin-top:6px', text: `Próximo: ${next.label} — ${next.kills} abates${next.cost ? ` e ${next.cost} ouro` : ''}, registrado em Verdelume.` }));
      };
      body.append(h('div', { class: 'row', style: 'align-items:flex-start;gap:10px;margin-top:6px' }, list, detail));
      show();
    },
    { wide: true },
  );
}
