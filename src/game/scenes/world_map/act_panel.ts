import { btn, h, toast } from '@ui/dom';
import type { Campaign } from '../../world/campaign';
import { capitals, node } from '../../world/layout';
import { ACTS, actContracts, chapterOf, ensureActs } from '../../world/acts_state';
import { verifyClue, wanted } from '../../world/act_fugitive';
import { ensureFronts } from '../../world/act_fronts';
import { allianceBlock, makeAlliance } from '../../world/act_portals';
import { MUTATIONS, cleanse, cleanseBlock, corruption } from '../../world/act_void';
import { ensureBarons, baronDef } from '../../world/act_barons';
import { WAR_FRONTS, allocate, allocated, frontWon, warPoints } from '../../world/act_war_table';
import { rep, type Faction } from '../../world/politics';
import { CHAPTER_TITLE } from '../../world/story';
import { regionLabel, type Region } from '../../world/regions';

const bar = (v: number, color: string) => h('div', { style: `display:inline-block;height:8px;width:${Math.max(2, v * 1.4)}px;background:${color};vertical-align:middle;margin:0 6px` });

/**
 * Aba "★ Ato" da Sala de guerra: o sistema próprio do capítulo atual (F5) — Favor da Coroa,
 * Procurado e pistas, frentes, portais e alianças, Vazio, acampamento, Barões, mesa de guerra.
 */
export function renderActPanel(c: Campaign, list: HTMLElement, rerender: () => void, go: (id: string) => () => void): void {
  const ch = chapterOf(c);
  const a = ensureActs(c);
  list.append(h('h3', { class: 'gold', text: `★ ${CHAPTER_TITLE[ch]}` }));
  switch (ch) {
    case 0:
      list.append(h('div', { class: 'muted', text: 'Cada senhor que o comandante ajuda agora lembra no Ato 4, quando as alianças forem negociadas.' }));
      for (const cap of capitals()) list.append(h('div', { text: `${cap.name}: confiança ${rep(c, cap.countryId as Faction)}` }));
      break;
    case 1:
      list.append(h('div', {}, h('span', { text: '👑 Favor da Coroa' }), bar(a.favor, '#ffd54f'), h('span', { text: String(a.favor) })));
      list.append(h('div', { class: 'muted', text: a.suspicion >= 40 ? 'Algo não fecha nas ordens do Templo… (a dúvida cresce)' : 'Cumpra as ordens do rei para ganhar Favor e equipamento. Ignorar custa Favor.' }));
      for (const ct of actContracts(c, 'ordem')) list.append(h('div', { class: 'item row', style: 'justify-content:space-between' }, h('span', { text: `${ct.title} · prazo ${Math.max(0, Math.round(((ct.expiresAt ?? c.hours) - c.hours) / 24))}d` }), btn('Ver', go(ct.targetNode), { class: 'small' })));
      break;
    case 2: {
      list.append(h('div', { class: 'muted', text: 'Procurado sobe quando vocês são vistos na estrada ou lutam. O mato e os refúgios escondem. Em 3+, caçadores e subornos; em 5, ninguém se alista.' }));
      const hot = Object.entries(a.wanted).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
      for (const [p, v] of hot) list.append(h('div', { text: `${node(p).name}: ${'★'.repeat(v)}${'☆'.repeat(ACTS.fugitive.wantedMax - v)}` }));
      if (!hot.length) list.append(h('div', { class: 'muted', text: 'Ninguém está atrás de vocês… por enquanto.' }));
      list.append(h('h3', { class: 'gold', text: `🔎 Quadro de investigação (${a.clues.length} pistas)` }));
      if (!a.clues.length) list.append(h('div', { class: 'muted', text: 'Sem pistas. Rumores de taverna, interrogatórios e vitórias sobre humanos rendem pistas. As missões principais pedem pistas.' }));
      for (const cl of a.clues)
        list.append(
          h('div', { class: 'item row', style: 'justify-content:space-between;gap:8px' },
            h('span', { text: `${cl.verified ? '✔' : '?'} ${cl.text}` }),
            cl.verified ? '' : btn(`Verificar (−${ACTS.fugitive.verifyIntel} 👁)`, () => {
              const r = verifyClue(c, cl.id);
              if (r) toast(r === 'falsa' ? 'Pista falsa: descartada.' : 'Pista verdadeira.');
              rerender();
            }, { class: 'small', disabled: (c.politics?.intel ?? 0) < ACTS.fugitive.verifyIntel }),
          ),
        );
      break;
    }
    case 3:
      list.append(h('div', { class: 'muted', text: `Toda semana as frentes andam. Operações mudam a balança; cada uma feita antes do assalto ao palácio tira uma onda da batalha final (preparo ${a.prep}/${ACTS.fronts.prepMax}).` }));
      for (const f of ensureFronts(c)) {
        const cap = capitals().find((n) => n.countryId === f.country);
        list.append(h('div', {}, h('b', { text: cap?.name ?? f.country }), h('span', { text: ' Coroa' }), bar(f.crown, '#e57373'), h('span', { text: ` ${f.crown} · Resistência` }), bar(f.resistance, '#81c784'), h('span', { text: ` ${f.resistance} · moral ${f.morale}` })));
      }
      for (const ct of actContracts(c, 'frente')) list.append(h('div', { class: 'item row', style: 'justify-content:space-between' }, h('span', { text: ct.title }), btn('Ver', go(ct.targetNode), { class: 'small' })));
      break;
    case 4: {
      list.append(h('h3', { class: 'gold', text: '🌀 Portais' }));
      if (!a.portals.length) list.append(h('div', { class: 'muted', text: 'Nenhum portal aberto.' }));
      for (const p of a.portals) list.append(h('div', { class: 'item row', style: 'justify-content:space-between' }, h('span', { text: `${node(p.at).name}: amadurece ${Math.round(p.maturity)}%` }), btn('Ver', go(p.at), { class: 'small' })));
      if (a.blighted.length) list.append(h('div', { style: 'color:#9e9e9e', text: `Terra Morta: ${a.blighted.map((id) => node(id).name).join(', ')}` }));
      list.append(h('h3', { class: 'gold', text: `🤝 Diplomacia (influência ${c.politics?.influence ?? 0})` }));
      for (const cap of capitals()) {
        const block = allianceBlock(c, cap.countryId!);
        const ally = a.alliances.includes(cap.countryId!);
        list.append(
          h('div', { class: 'item row', style: 'justify-content:space-between' },
            h('span', { text: `${cap.name}: confiança ${rep(c, cap.countryId as Faction)}${ally ? ' · ✔ aliada (tropa nas batalhas, território e renda)' : ''}` }),
            ally ? '' : btn(`Aliar-se (−${ACTS.portals.allianceInfluence} influência)`, () => {
              if (makeAlliance(c, cap.countryId!)) toast(`Aliança com ${cap.name}!`);
              rerender();
            }, { class: 'small', disabled: !!block, title: block ?? '' }),
          ),
        );
      }
      break;
    }
    case 5: {
      const cv = a.caravan;
      if (cv) list.append(h('div', { class: 'gold', text: cv.done ? `🛒 Caravana: ${cv.survivors ? `chegou com ${cv.survivors}` : 'perdida'}.` : `🛒 Caravana em ${node(cv.at).name}: ${cv.survivors} sobreviventes (precisa de escolta).` }));
      list.append(h('div', { class: 'muted', text: 'Nas capitais e na Citadela, o menu do esquadrão atravessa para o Vazio. Lá a corrupção sobe todo dia: 25 dá o Dom sombrio; 50, 75 e 100 trazem mutações permanentes. O Santuário limpa a corrupção.' }));
      for (const hero of Object.values(c.roster)) {
        const cor = corruption(c, hero);
        const muts = (a.mutations[hero.id] ?? []).map((id) => MUTATIONS.find((m) => m.id === id)?.label ?? id);
        if (!cor && !muts.length) continue;
        const block = cleanseBlock(c, hero);
        list.append(
          h('div', { class: 'item row', style: 'justify-content:space-between' },
            h('span', { text: `${hero.name}: corrupção ${cor}${muts.length ? ` · ${muts.join(', ')}` : ''}` }),
            btn(`Purificar (${ACTS.void.cleanseGold} ouro)`, () => (cleanse(c, hero), rerender()), { class: 'small', disabled: !!block, title: block ?? '' }),
          ),
        );
      }
      break;
    }
    case 6:
      list.append(h('div', { class: 'gold', text: a.camp ? `⛺ Acampamento em ${node(a.camp).name}` : '⛺ Sem acampamento: monte um numa vila do continente (menu do esquadrão).' }));
      for (const [id, r] of Object.entries(a.shifted)) list.append(h('div', { text: `🌫 ${node(id).name} agora é ${regionLabel(r as Region)}${a.closed.includes(id) ? ' (passagem fechada)' : ''}` }));
      break;
    case 7:
      list.append(h('div', { class: 'muted', text: `Tomar os postos de um Barão atrasa o Despertar (${c.veil?.value ?? 0}/100) e dá postos avançados. O Barão atacado contra-ataca; matar um deixa os outros mais fortes.` }));
      for (const b of ensureBarons(c)) list.append(h('div', { style: b.dead ? 'color:#81c784' : '', text: `${b.dead ? '✔' : '☠'} ${baronDef(b.id).name} · rancor ${b.rage} · postos: ${b.posts.map((p) => node(p).name).join(', ') || 'nenhum'}` }));
      break;
    case 8: {
      const pts = warPoints(c);
      list.append(h('div', { class: 'gold', text: `⚔ Mesa de guerra: ${allocated(c)}/${pts.total} de força distribuída` }), h('div', { class: 'muted', text: pts.parts.join(' · ') }));
      for (const f of WAR_FRONTS)
        list.append(
          h('div', { class: 'item row', style: 'justify-content:space-between' },
            h('span', { text: `${f.label}: ${a.warTable[f.id] ?? 0}/${f.need}${frontWon(c, f.id) ? ' ✔ aliados e uma onda a menos' : ''}` }),
            h('span', { class: 'row', style: 'gap:4px' }, btn('−', () => (allocate(c, f.id, -1), rerender()), { class: 'small' }), btn('+', () => (allocate(c, f.id, 1), rerender()), { class: 'small' })),
          ),
        );
      break;
    }
  }
}
