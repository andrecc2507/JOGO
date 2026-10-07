import { btn, clear, h, modal, toast } from '@ui/dom';
import { TRAVEL_SPEED, acceptContract, allContracts, squadById, type Campaign } from '../../world/campaign';
import { BOARDS, boardContracts, boardRep, openBoards, refreshBoard } from '../../world/boards';
import { ensureExpedition, legendList } from '../../world/expedition';
import { OUTPOST_KINDS } from '../../world/outposts';
import { seasonLabel } from '../../world/season';
import { renderActPanel } from './act_panel';
import { node, nodeOpen } from '../../world/layout';
import { regionLabel } from '../../world/regions';
import { OWNER_COLOR, OWNER_LABEL, ensureWorld, estimate, infoAge, reveal, type Owner } from '../../world/territory';
import { FACTIONS, OPS, RES, activeOps, approval, approvalState, counterSlotsLeft, ensurePolitics, rep, revealOp, spendIntel, type Faction } from '../../world/politics';
import { GOAL_LABEL, forceEta, forceIcon, forceLabel, forceVisible } from '../../world/forces';
import { chapterOf, counterOp, mySide } from '../../world/commander';

/**
 * Sala de guerra (C10–C13): territórios por dono, províncias em perigo, forças inimigas avistadas
 * (com destino e prazo) e as crises abertas. `onGo` centraliza o mapa num lugar.
 */
export function openWarRoom(c: Campaign, onGo: (nodeId: string) => void): void {
  modal('🗺 Sala de guerra', (body, m) => {
    const tabs = h('div', { class: 'tabs' });
    const list = h('div', { class: 'col', style: 'max-height:60vh;overflow:auto;gap:4px' });
    body.append(tabs, list);
    let tab: 'territorio' | 'forcas' | 'crises' | 'politica' | 'faccoes' | 'expedicao' | 'ato' = 'territorio';
    const go = (id: string) => () => {
      m.close();
      onGo(id);
    };
    const render = () => {
      clear(tabs);
      for (const [k, label] of [['territorio', '🏴 Territórios'], ['forcas', '👁 Forças inimigas'], ['crises', '⚠ Crises'], ['politica', '🜏 Política'], ['faccoes', '📜 Facções'], ['expedicao', '🧭 Expedição'], ['ato', '★ Ato']] as const)
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
      } else if (tab === 'politica') {
        const p = ensurePolitics(c);
        list.append(h('div', { class: 'gold', text: `🤝 Influência ${p.influence} · 👁 Informação ${p.intel}` }));
        // Planos do inimigo (C12).
        list.append(h('h3', { class: 'gold', text: 'Planos do inimigo para o próximo mês' }));
        if (!p.proposed.length) list.append(h('div', { class: 'muted', text: 'Nenhum plano conhecido. O inimigo trama no começo de cada mês.' }));
        p.proposed.forEach((op, i) => {
          const def = OPS.list[op.id];
          list.append(
            h('div', { class: 'item row', style: 'justify-content:space-between;gap:8px' },
              h('div', {}, h('b', { text: op.revealed ? def.label : '??? (plano oculto)' }), h('div', { class: 'muted', text: op.foiled ? '✔ Frustrado.' : op.countering ? '⏳ Missão para frustrar em andamento (veja as Crises).' : op.revealed ? def.text : `Gaste ${RES.revealOpCost} de informação para descobrir.` })),
              op.revealed
                ? btn('Frustrar', () => {
                    const ct = counterOp(c, i);
                    if (ct) toast(`Missão aberta: ${ct.title}.`);
                    render();
                  }, { class: 'small', disabled: op.foiled || op.countering || counterSlotsLeft(c) <= 0 })
                : btn(`Revelar (−${RES.revealOpCost} 👁)`, () => (revealOp(c, i), render()), { class: 'small', disabled: p.intel < RES.revealOpCost }),
            ),
          );
        });
        const act = activeOps(c);
        if (act.length) list.append(h('div', { style: 'color:#e57373', text: `Em vigor: ${act.map((id) => `${OPS.list[id].label} (${OPS.list[id].text})`).join(' · ')}` }));
        // Reputação (C15).
        list.append(h('h3', { class: 'gold', text: 'Reputação' }));
        for (const [f, name] of Object.entries(FACTIONS)) {
          const r = rep(c, f as Faction);
          list.append(h('div', { class: 'row', style: 'gap:8px;align-items:center' }, h('span', { style: 'min-width:160px', text: name }), h('div', { style: `height:8px;width:${Math.abs(r) * 1.2}px;background:${r >= 0 ? '#81c784' : '#e57373'}` }), h('span', { class: 'muted', text: `${r > 0 ? '+' : ''}${r}` })));
        }
        // Aprovação dos companheiros (C16).
        const story = Object.values(c.roster).filter((ch) => ch.storyId);
        if (story.length) {
          list.append(h('h3', { class: 'gold', text: 'Companheiros da história' }));
          for (const ch of story) {
            const a = approval(c, ch.storyId!);
            const st = approvalState(c, ch.storyId);
            list.append(h('div', { text: `${ch.name}: ${a > 0 ? '+' : ''}${a}${st === 'confia' ? ' · confia em você (+mira, +crítico)' : st === 'recusa' ? ' · se recusa a lutar' : ''}` }));
          }
        }
        // Batedores (C20): gastar informação para ver uma província agora.
        list.append(h('h3', { class: 'gold', text: `Batedores (−${RES.scoutRegionCost} 👁)` }));
        const sel = h('select', {}) as HTMLSelectElement;
        for (const [id, st] of Object.entries(w.provinces)) if (st.known && nodeOpen(node(id), ch)) sel.append(h('option', { value: id, text: node(id).name }));
        list.append(h('div', { class: 'row', style: 'gap:6px' }, sel, btn('Enviar batedores', () => {
          if (spendIntel(c, RES.scoutRegionCost)) {
            reveal(c, sel.value, ch);
            toast(`Batedores em ${node(sel.value).name}: forças e medo atualizados.`);
            render();
          }
        }, { disabled: p.intel < RES.scoutRegionCost })));
      } else if (tab === 'faccoes') {
        // Quadros de contratos por facção (C23/C24).
        const boards = openBoards(c);
        if (!boards.length) list.append(h('div', { class: 'muted', text: 'Nenhuma facção oferece trabalho agora (reputação baixa ou capítulo cedo demais).' }));
        const free = c.squads.filter((s) => s.memberIds.length);
        for (const b of boards) {
          if (!boardContracts(c, b).length) refreshBoard(c, b);
          list.append(h('h3', { class: 'gold', text: `${BOARDS[b].label} · reputação ${boardRep(c, b)}` }));
          for (const ct of boardContracts(c, b).filter((x) => x.status !== 'done')) {
            const sel = h('select', {}) as HTMLSelectElement;
            for (const s of free) sel.append(h('option', { value: s.id, text: s.name }));
            const left = ct.expiresAt !== undefined ? Math.max(0, Math.round(ct.expiresAt - c.hours)) : null;
            list.append(
              h('div', { class: 'item row', style: 'justify-content:space-between;gap:8px' },
                h('div', {},
                  h('b', { text: ct.title }),
                  h('div', { class: 'muted', text: `${ct.description} · ${node(ct.targetNode).name} · nível ${ct.level} · ${ct.rewardGold} ouro${left !== null ? ` · prazo ${Math.floor(left / 24)}d ${left % 24}h` : ''}${ct.status === 'accepted' ? ` · ✔ com ${squadById(c, ct.squadId)?.name ?? '—'}` : ''}` }),
                ),
                ct.status === 'accepted'
                  ? btn('Ver', go(ct.targetNode), { class: 'small' })
                  : h('div', { class: 'row', style: 'gap:4px' }, sel, btn('Aceitar', () => {
                      const s = squadById(c, sel.value);
                      if (s) acceptContract(c, ct, s);
                      render();
                    }, { class: 'small', disabled: !free.length })),
              ),
            );
          }
        }
      } else if (tab === 'ato') {
        renderActPanel(c, list, render, go);
      } else if (tab === 'expedicao') {
        // Estação, lendas (C25), postos (C18) e tesouro (C26).
        const e = ensureExpedition(c);
        list.append(h('div', { class: 'gold', text: `${seasonLabel(c)} · ${e.visited.length} lugares distantes visitados` }));
        if (e.treasure) list.append(h('div', { class: 'item row', style: 'justify-content:space-between' }, h('span', { text: `🗺 Mapa do tesouro: ${node(e.treasure).name}` }), btn('Ver', go(e.treasure), { class: 'small' })));
        list.append(h('h3', { class: 'gold', text: 'Lendas' }));
        for (const l of legendList(c))
          list.append(h('div', { style: l.done ? 'color:#81c784' : l.known ? '' : 'opacity:.6', text: `${l.done ? '✔' : l.known ? '🗝' : '?'} ${l.title}${l.where !== l.title ? ` — ${l.where}` : ''}${!l.known && !l.done ? ' (procure pistas em tavernas e na estrada)' : ''}` }));
        list.append(h('h3', { class: 'gold', text: 'Postos avançados' }));
        const posts = Object.entries(c.outposts ?? {});
        if (!posts.length) list.append(h('div', { class: 'muted', text: 'Nenhum posto. Com um esquadrão parado em terra aliada ou livre, abra o menu do lugar e construa.' }));
        for (const [id, k] of posts) list.append(h('div', { class: 'item row', style: 'justify-content:space-between' }, h('span', { text: `${OUTPOST_KINDS[k].icon} ${OUTPOST_KINDS[k].label} — ${node(id).name} (${OUTPOST_KINDS[k].upkeep}/mês)` }), btn('Ver', go(id), { class: 'small' })));
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
