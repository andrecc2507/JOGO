import { btn, clear, h, modal } from '@ui/dom';
import { ATTRS, ATTR_SHORT, DB, item } from '../../data';
import { RARITY_COLOR, RARITY_LABEL } from '../../world/encounters';
import { Audio } from '../../audio/audio';
import {
  acceptContract,
  buy,
  recruit,
  refreshRecruits,
  sell,
  shopStock,
  SQUAD_MAX,
  type Campaign,
  type Squad,
} from '../../world/campaign';
import { countryOf, node } from '../../world/layout';

const RUMORS = [
  'Dizem que soldados do rei levam crianças ao templo durante a noite…',
  'Um viajante jura ter visto um olho carmesim brilhar numa ruína ao norte.',
  'Os rebeldes não atacam aldeões. Estranho para bandidos, não?',
  'Nas montanhas, um wyrm de gelo protege uma lâmina lendária.',
  'O conselheiro do rei não envelhece. Minha avó o conheceu jovem… igualzinho.',
  'Água e raio não combinam — a não ser que você queira fritar um batalhão.',
  'Óleo espalhado e uma faísca: melhor que qualquer exército.',
  'Há lendas de um cervo ancestral que cura quem o encontra na floresta.',
  'O clero anda comprando velas negras aos montes. Para que tanto?',
  'Magos da neve ensinam: molhe o inimigo antes de congelá-lo.',
  'Um arqueiro no alto de uma colina enxerga e acerta mais longe.',
  'Quem se esconde no mato ou na fumaça escapa dos olhos dos vigias.',
];

/** Tela da capital (estilo menus do FFT): Loja, Taverna (contratos + rumores) e Recrutamento. */
export function openCapital(c: Campaign, capitalId: string, squad: Squad | undefined, onChange: () => void): void {
  const country = countryOf(capitalId);
  const title = `${node(capitalId).name} — ${country ? `${DB.classes[country.classId].name}s` : ''}`;
  modal(
    title,
    (body) => {
      const tabs = h('div', { class: 'tabs' });
      const content = h('div', {});
      const gold = h('div', { class: 'gold', style: 'margin-bottom:6px' });
      let current = 'loja';
      const render = () => {
        gold.textContent = `💰 ${c.gold} ouro ${squad ? `· Esquadrão presente: ${squad.name} (${squad.memberIds.length}/${SQUAD_MAX})` : '· Nenhum esquadrão aqui'}`;
        clear(tabs);
        for (const [id, label] of [
          ['loja', '🛒 Loja'],
          ['taverna', '🍺 Taverna'],
          ['recrutamento', '🪖 Recrutamento'],
        ] as const)
          tabs.append(btn(label, () => ((current = id), render()), { class: current === id ? 'active' : '' }));
        clear(content);
        if (current === 'loja') renderShop(content);
        else if (current === 'taverna') renderTavern(content);
        else renderRecruit(content);
        onChange();
      };
      const bag = () => (capitalId === c.baseNode || !squad ? c.inventory : squad.carried);
      const renderShop = (el: HTMLElement) => {
        const buyCol = h('div', { class: 'col' }, h('h3', { class: 'gold', text: 'Comprar' }));
        for (const id of shopStock(capitalId)) {
          const it = item(id);
          buyCol.append(
            h(
              'div',
              { class: 'item row', style: 'justify-content:space-between' },
              h('div', {}, h('b', { text: it.name, style: `color:${RARITY_COLOR[it.rarity]}` }), h('span', { class: 'muted', text: ` · ${RARITY_LABEL[it.rarity]} · ${it.description}` })),
              btn(`${it.price} 💰`, () => {
                if (buy(c, squad, capitalId, id)) {
                  Audio.sfx('coin');
                  render();
                }
              }, { disabled: c.gold < it.price }),
            ),
          );
        }
        const sellCol = h('div', { class: 'col' }, h('h3', { class: 'gold', text: capitalId === c.baseNode || !squad ? 'Vender (inventário da base)' : `Vender (carregado por ${squad.name})` }));
        const entries = Object.entries(bag());
        if (!entries.length) sellCol.append(h('div', { class: 'muted', text: 'Nada para vender.' }));
        for (const [id, n] of entries) {
          const it = item(id);
          sellCol.append(h('div', { class: 'item row', style: 'justify-content:space-between' }, h('span', { text: `${it.name} ×${n}` }), btn(`+${Math.floor(it.price / 2)}`, () => (sell(c, bag(), id), render()))));
        }
        if (capitalId !== c.baseNode && squad) sellCol.append(h('div', { class: 'muted', style: 'margin-top:6px', text: 'Itens comprados longe da base ficam com o esquadrão até ele voltar à base.' }));
        el.append(h('div', { class: 'grid2', style: 'grid-template-columns:1.4fr 1fr' }, buyCol, sellCol));
      };
      const renderTavern = (el: HTMLElement) => {
        el.append(h('h3', { class: 'gold', text: `Quadro de contratos · Ato ${c.act}` }));
        const list = c.contracts[capitalId] ?? [];
        if (!list.length) el.append(h('div', { class: 'muted', text: 'Nenhum contrato neste ato.' }));
        for (const ct of list) {
          const target = node(ct.targetNode);
          el.append(
            h(
              'div',
              { class: 'item' },
              h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: ct.title }), h('span', { class: 'tag', text: ct.status === 'open' ? 'aberto' : ct.status === 'accepted' ? 'aceito' : 'concluído' })),
              h('div', { class: 'muted', text: `${ct.description} Local: ${target.type === 'waypoint' ? 'estrada' : target.name}. Nível ${ct.level}.` }),
              h('div', { text: `Recompensa: ${ct.rewardGold} ouro · ${ct.rewardXp} XP${ct.rewardItem ? ` · ${item(ct.rewardItem).name}` : ''}` }),
              ct.status === 'open' && squad ? btn(`Aceitar com ${squad.name}`, () => (acceptContract(c, ct, squad), render())) : null,
            ),
          );
        }
        el.append(h('h3', { class: 'gold', style: 'margin-top:10px', text: 'Rumores' }));
        const box = h('div', { class: 'col' });
        const hear = () => {
          clear(box);
          const picks = [...RUMORS].sort(() => Math.random() - 0.5).slice(0, 3);
          for (const r of picks) box.append(h('div', { class: 'item', text: `“${r}”` }));
        };
        hear();
        el.append(box, btn('Pagar uma rodada (5 ouro) e ouvir mais', () => {
          if (c.gold >= 5) {
            c.gold -= 5;
            hear();
            gold.textContent = `💰 ${c.gold} ouro`;
          }
        }));
      };
      const renderRecruit = (el: HTMLElement) => {
        const pool = c.recruits[capitalId];
        if (!pool) refreshRecruits(c, capitalId);
        const list = c.recruits[capitalId]!.list;
        el.append(h('div', { class: 'muted', text: 'Aprendizes escolhem a classe ao passar do 1º nível. Recrutas da capital já vêm com build direcionada. A lista renova todo mês.' }));
        if (!list.length) el.append(h('div', { class: 'muted', text: 'Ninguém disponível até o próximo mês.' }));
        list.forEach((cand, i) => {
          const ch = cand.character;
          el.append(
            h(
              'div',
              { class: 'item row', style: 'justify-content:space-between' },
              h(
                'div',
                {},
                h('b', { text: ch.name }),
                h('span', { class: 'muted', text: ` · ${DB.classes[ch.classId].name} Nv ${ch.level}` }),
                h('div', { class: 'muted', style: 'font-size:11px', text: ATTRS.map((a) => `${ATTR_SHORT[a]} ${ch.attrs[a]}`).join('  ') }),
              ),
              btn(`${cand.price} 💰`, () => {
                const err = recruit(c, squad, capitalId, i);
                if (err) alert(err);
                render();
              }, { disabled: c.gold < cand.price }),
            ),
          );
        });
      };
      body.append(gold, tabs, content);
      render();
    },
    { wide: true, onClose: onChange },
  );
}
