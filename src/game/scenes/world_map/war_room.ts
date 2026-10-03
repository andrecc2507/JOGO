import { btn, clear, h, modal } from '@ui/dom';
import { TRAVEL_SPEED, allContracts, type Campaign } from '../../world/campaign';
import { node, nodeOpen } from '../../world/layout';
import { regionLabel } from '../../world/regions';
import { OWNER_COLOR, OWNER_LABEL, ensureWorld, estimate, infoAge, type Owner } from '../../world/territory';
import { GOAL_LABEL, forceEta, forceIcon, forceLabel, forceVisible } from '../../world/forces';
import { chapterOf, mySide } from '../../world/commander';

/**
 * Sala de guerra (C10–C13): territórios por dono, províncias em perigo, forças inimigas avistadas
 * (com destino e prazo) e as crises abertas. `onGo` centraliza o mapa num lugar.
 */
export function openWarRoom(c: Campaign, onGo: (nodeId: string) => void): void {
  modal('🗺 Sala de guerra', (body, m) => {
    const tabs = h('div', { class: 'tabs' });
    const list = h('div', { class: 'col', style: 'max-height:60vh;overflow:auto;gap:4px' });
    body.append(tabs, list);
    let tab: 'territorio' | 'forcas' | 'crises' = 'territorio';
    const go = (id: string) => () => {
      m.close();
      onGo(id);
    };
    const render = () => {
      clear(tabs);
      for (const [k, label] of [['territorio', '🏴 Territórios'], ['forcas', '👁 Forças inimigas'], ['crises', '⚠ Crises']] as const)
        tabs.append(btn(label, () => ((tab = k), render()), { class: tab === k ? 'active' : '' }));
      clear(list);
      const w = ensureWorld(c);
      const ch = chapterOf(c);
      if (tab === 'territorio') {
        const side = mySide(c);
        const counts = new Map<Owner, number>();
        for (const [id, st] of Object.entries(w.provinces)) if (nodeOpen(node(id), ch) && st.known) counts.set(st.owner, (counts.get(st.owner) ?? 0) + 1);
        list.append(
          h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' }, ...[...counts.entries()].map(([o, n]) => h('span', { style: `color:${OWNER_COLOR[o]}`, text: `■ ${OWNER_LABEL[o]}: ${n}${side.includes(o) ? ' (aliado)' : ''}` }))),
          h('div', { class: 'muted', text: 'Medo em 100 faz a província cair para quem a ameaça. Vitórias por perto acalmam; crises ignoradas e saques assustam.' }),
        );
        const rows = Object.entries(w.provinces)
          .filter(([id, st]) => nodeOpen(node(id), ch) && st.known)
          .sort((a, b) => b[1].fear - a[1].fear);
        for (const [id, st] of rows) {
          const n = node(id);
          const age = infoAge(c, id);
          list.append(
            h('div', { class: 'item row', style: 'justify-content:space-between;gap:8px' },
              h('div', {},
                h('b', { style: `color:${OWNER_COLOR[st.owner]}`, text: n.name }),
                h('span', { class: 'muted', text: ` · ${regionLabel(n.region)} · ${OWNER_LABEL[st.owner]} · controle ${Math.round(st.control)} · medo ${Math.round(st.fear)}${age > 24 * 10 ? ' · informação velha' : ''}` }),
              ),
              btn('Ver', go(id), { class: 'small' }),
            ),
          );
        }
      } else if (tab === 'forcas') {
        const seen = (w.forces ?? []).filter((f) => forceVisible(c, f));
        if (!seen.length) list.append(h('div', { class: 'muted', text: 'Nenhuma força avistada. Batedores, torres de vigia e esquadrões em campo revelam o que se move no mapa.' }));
        for (const f of seen) {
          const [lo, hi] = estimate(c, f.at, f.units.length);
          const eta = Math.round(forceEta(f, TRAVEL_SPEED));
          list.append(
            h('div', { class: 'item row', style: 'justify-content:space-between;gap:8px' },
              h('div', {},
                h('b', { style: `color:${OWNER_COLOR[f.owner]}`, text: `${forceIcon(f)} ${forceLabel(f)}` }),
                h('span', { class: 'muted', text: ` · ${lo === hi ? lo : `${lo}–${hi}`} combatentes · nível ~${f.level} · quer ${GOAL_LABEL[f.goal]} em ${node(f.target).name} · chega em ~${eta >= 24 ? `${Math.floor(eta / 24)}d ${eta % 24}h` : `${eta}h`}` }),
              ),
              btn('Ver', go(f.to ?? f.at), { class: 'small' }),
            ),
          );
        }
      } else {
        const open = allContracts(c).filter((ct) => ct.crisis && ct.status !== 'done');
        if (!open.length) list.append(h('div', { class: 'muted', text: 'Nenhuma crise aberta.' }));
        for (const ct of open) {
          const left = Math.max(0, Math.round((ct.expiresAt ?? c.hours) - c.hours));
          list.append(
            h('div', { class: 'item row', style: 'justify-content:space-between;gap:8px' },
              h('div', {},
                h('b', { text: ct.title }),
                h('div', { class: 'muted', text: `${ct.description} · nível ${ct.level} · ${ct.rewardGold} ouro · prazo ${left >= 24 ? `${Math.floor(left / 24)}d ${left % 24}h` : `${left}h`}` }),
              ),
              btn('Ver', go(ct.targetNode), { class: 'small' }),
            ),
          );
        }
      }
    };
    render();
  });
}
