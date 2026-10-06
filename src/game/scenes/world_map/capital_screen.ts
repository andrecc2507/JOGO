import { btn, clear, h, modal, toast } from '@ui/dom';
import { buildLabel } from '../../rules/skill_tree';
import { ATTRS, ATTR_SHORT, DB, item } from '../../data';
import { RARITY_COLOR, RARITY_LABEL } from '../../world/encounters';
import { Audio } from '../../audio/audio';
import {
  acceptContract,
  buy,
  shopPrice,
  recruit,
  refreshRecruits,
  sell,
  sellLoot,
  shopStock,
  SQUAD_MAX,
  type Campaign,
  type Squad,
} from '../../world/campaign';
import { lootName, lootPrice } from '../../rules/drops';
import { countryOf, node } from '../../world/layout';
import { factionOfCountry, opActive, priceMult, rep } from '../../world/politics';
import { members, reserve, travelers } from '../../world/campaign';
import {
  SERVICE_LABEL,
  baseItemId,
  blackMarketLootPrice,
  blackMarketPrice,
  blackMarketStock,
  buyBlackMarket,
  capitalService,
  cancelHunt,
  huntBlocker,
  loreBlocker,
  startHunt,
  loreTier,
  nextLore,
  refineBlocker,
  refineCost,
  refineItem,
  refineLevel,
  refineService,
  registerLore,
  sellLootBlackMarket,
  LORE,
  type CapitalService,
} from '../../world/capital_services';
import { ensureStory } from '../../world/story';
import STORY_RUMOR_DATA from '../../data/story/rumors.json';

const STORY_RUMORS = STORY_RUMOR_DATA as Record<string, string[]>;

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
  // Dicas da forma fortificada (habilidade no Nv 5) — segredo do treino.
  'Meu avô dizia: golpe repetido mil vezes deixa de ser golpe. Vira outra coisa. Ninguém sabe dizer o quê antes de chegar lá.',
  'Uma velha das cinzas jura que o feitiço muito treinado aprende a pedir mais mana — e paga em dobro.',
  'O mestre da guarda só tinha uma estocada. Mas, quando queria, ela caía duas vezes no mesmo instante.',
  'Dizem que a quinta vez que se domina uma técnica é diferente das outras quatro. A lâmina lembra.',
  'Os antigos do Véu falavam de "transcender": treinar um gesto até que ele escolha a forma que quiser ter.',
  'Vi um clérigo curar um só ferido… e a luz transbordou para todos ao redor. Coisa de quem reza a mesma prece há anos.',
  'Um arqueiro velho me contou: a flecha que você conhece de cor encontra outros alvos sozinha.',
];

/** Tela da capital (estilo menus do FFT): Loja, Taverna (contratos + rumores) e Recrutamento. */
export type CapitalTab = 'loja' | 'taverna' | 'recrutamento' | 'especial';

export function openCapital(c: Campaign, capitalId: string, squad: Squad | undefined, onChange: () => void, opts: { recruitOnly?: boolean; tab?: CapitalTab } = {}): void {
  const country = countryOf(capitalId);
  const fac = factionOfCountry(country?.id);
  const title = opts.recruitOnly ? `${node(capitalId).name} — Recrutamento de Aprendizes` : `${node(capitalId).name} — ${country ? `${country.name}, ${country.epithet}` : ''}${fac ? ` · reputação ${rep(c, fac) > 0 ? '+' : ''}${rep(c, fac)}` : ''}`;
  modal(
    title,
    (body) => {
      const tabs = h('div', { class: 'tabs' });
      const content = h('div', {});
      const gold = h('div', { class: 'gold', style: 'margin-bottom:6px' });
      let current: string = opts.recruitOnly ? 'recrutamento' : opts.tab ?? 'loja';
      const service = capitalService(capitalId);
      const render = () => {
        gold.textContent = `💰 ${c.gold} ouro ${squad ? `· Esquadrão presente: ${squad.name} (${squad.memberIds.length}/${SQUAD_MAX})` : '· Nenhum esquadrão aqui'}`;
        clear(tabs);
        for (const [id, label] of (opts.recruitOnly
          ? [['recrutamento', '🪖 Recrutamento']]
          : [
              ['loja', '🛒 Loja'],
              ['taverna', '🍺 Taverna'],
              ['recrutamento', '🪖 Recrutamento'],
              ['especial', service ? SERVICE_LABEL[service] : '✨ Em breve'],
            ]) as [string, string][])
          tabs.append(btn(label, () => ((current = id), render()), { class: current === id ? 'active' : '' }));
        clear(content);
        if (current === 'loja') renderShop(content);
        else if (current === 'taverna') renderTavern(content);
        else if (current === 'especial') renderSpecial(content, service, squad, render);
        else renderRecruit(content);
        onChange();
      };
      const bag = () => (capitalId === c.baseNode || !squad ? c.inventory : squad.carried);
      const renderShop = (el: HTMLElement) => {
        const mult = priceMult(c, country?.id);
        const buyCol = h('div', { class: 'col' }, h('h3', { class: 'gold', text: 'Comprar' }), Math.abs(mult - 1) > 0.01 ? h('div', { class: 'muted', text: `Preços ${mult < 1 ? `${Math.round((1 - mult) * 100)}% menores` : `${Math.round((mult - 1) * 100)}% maiores`} (reputação${opActive(c, 'sobretaxa') ? ' e Sobretaxa do inimigo' : ''}).` }) : '');
        for (const id of shopStock(capitalId)) {
          const it = item(id);
          buyCol.append(
            h(
              'div',
              { class: 'item row', style: 'justify-content:space-between' },
              h('div', {}, h('b', { text: it.name, style: `color:${RARITY_COLOR[it.rarity]}` }), h('span', { class: 'muted', text: ` · ${RARITY_LABEL[it.rarity]} · ${it.description}` })),
              btn(`${shopPrice(c, capitalId, id)} 💰`, () => {
                if (buy(c, squad, capitalId, id)) {
                  Audio.sfx('coin');
                  render();
                }
              }, { disabled: c.gold < shopPrice(c, capitalId, id) }),
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
        // Espólio das feras: materiais, troféus e joias da alma.
        const lootBag = capitalId === c.baseNode || !squad ? c.materials : squad.loot;
        const loot = Object.entries(lootBag).filter(([, n]) => n > 0);
        sellCol.append(h('h3', { class: 'gold', style: 'margin-top:10px', text: capitalId === c.baseNode || !squad ? 'Vender espólio (estoque da base)' : `Vender espólio (com ${squad.name})` }));
        if (!loot.length) sellCol.append(h('div', { class: 'muted', text: 'Nenhum material, troféu ou joia.' }));
        for (const [key, n] of loot.sort(([a], [b]) => lootName(a).localeCompare(lootName(b)))) {
          const price = lootPrice(key);
          sellCol.append(
            h('div', { class: 'item row', style: 'justify-content:space-between' },
              h('span', { text: `${key.startsWith('joia:') ? '💎 ' : ''}${lootName(key)} ×${n}` }),
              h('span', { class: 'row', style: 'gap:4px' },
                btn(`+${price}`, () => (sellLoot(c, lootBag, key, 1), Audio.sfx('coin'), render()), { class: 'small' }),
                n > 1 ? btn(`Todos +${price * n}`, () => (sellLoot(c, lootBag, key, n), Audio.sfx('coin'), render()), { class: 'small' }) : null,
              ),
            ),
          );
        }
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
          // Um rumor da história (do capítulo atual) e dois gerais.
          const story = STORY_RUMORS[String(ensureStory(c).chapter)] ?? [];
          if (story.length) box.append(h('div', { class: 'item', style: 'border-left:2px solid var(--gold)', text: `📖 “${story[Math.floor(Math.random() * story.length)]}”` }));
          const picks = [...RUMORS].sort(() => Math.random() - 0.5).slice(0, story.length ? 2 : 3);
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
        el.append(h('div', { class: 'muted', text: opts.recruitOnly ? 'A Citadela Real só forma Aprendizes: eles escolhem a classe ao passar do 1º nível. A lista renova todo mês.' : 'Aprendizes escolhem a classe ao passar do 1º nível. Recrutas da capital já vêm com build direcionada. A lista renova todo mês.' }));
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
                h('span', { class: 'muted', text: ` · ${buildLabel(ch)} · Nv ${ch.level}` }),
                h('div', { class: 'muted', style: 'font-size:11px', text: ATTRS.map((a) => `${ATTR_SHORT[a]} ${ch.attrs[a]}`).join('  ') }),
              ),
              btn(`${cand.price} 💰`, () => {
                const err = recruit(c, squad, capitalId, i);
                if (err) toast(err);
                render();
              }, { disabled: c.gold < cand.price }),
            ),
          );
        });
      };
      const renderSpecial = (el: HTMLElement, sv: CapitalService | null, sq: Squad | undefined, rerender: () => void) => {
        if (!sv) {
          el.append(h('div', { class: 'muted', text: 'A particularidade desta capital ainda está sendo decidida.' }));
          return;
        }
        if (sv === 'cacadores') renderHunters(c, el, rerender);
        else if (sv === 'mercado_negro') renderBlackMarket(c, el, sq ?? undefined, capitalId, rerender);
        else if (sv === 'enfermaria') renderInfirmary(c, el, sq);
        else renderRefine(c, el, sv, sq, capitalId, rerender);
      };
      body.append(gold, tabs, content);
      render();
    },
    { wide: true, onClose: onChange },
  );
}

/** Verdelume: registra o conhecimento de cada besta abatida (ficha, atributos, habilidades, Marca). */
function renderHunters(c: Campaign, el: HTMLElement, render: () => void): void {
  el.append(h('div', { class: 'muted', text: `Os caçadores de Verdelume registram o que você aprendeu caçando. Níveis: ${LORE.map((t) => `${t.label} (${t.kills} abates${t.cost ? `, ${t.cost} ouro` : ''})`).join(' → ')}. A Marca do Caçador dá bônus de dano e crítico contra a espécie.` }));
  el.append(h('div', { class: 'muted', style: 'margin-top:4px', text: '🎯 Caçar: escolha uma besta já abatida; o próximo encontro de qualquer esquadrão traz pelo menos uma dela. Uma caçada por vez.' }));
  if (c.hunt && DB.creatures[c.hunt])
    el.append(h('div', { class: 'item row', style: 'justify-content:space-between;margin-top:6px' },
      h('b', { class: 'gold', text: `🎯 Caçada aberta: ${DB.creatures[c.hunt]!.name}` }),
      btn('Encerrar caçada', () => (cancelHunt(c), render()), { class: 'small' }),
    ));
  const species = Object.entries(c.speciesKills)
    .filter(([id, n]) => n > 0 && DB.creatures[id])
    .sort((a, b) => b[1] - a[1]);
  if (!species.length) el.append(h('div', { class: 'muted', style: 'margin-top:6px', text: 'Nenhuma besta abatida ainda.' }));
  for (const [id, kills] of species) {
    const cr = DB.creatures[id]!;
    const tier = loreTier(c, id);
    const next = nextLore(c, id);
    const why = loreBlocker(c, id);
    el.append(
      h('div', { class: 'item row', style: 'justify-content:space-between' },
        h('div', {},
          h('b', { text: cr.name, style: `color:${RARITY_COLOR[cr.rarity]}` }),
          h('span', { class: 'muted', text: ` · ${kills} abate(s) · ${LORE.find((t) => t.tier === tier)?.label ?? '—'}` }),
        ),
        h('span', { class: 'row', style: 'gap:4px' },
          next ? btn(`Registrar ${next.label}${next.cost ? ` (${next.cost} 💰)` : ''}`, () => (registerLore(c, id), Audio.sfx('coin'), render()), { class: 'small', disabled: !!why, title: why ?? '' }) : h('span', { class: 'gold', text: '🏹 Marca' }),
          btn(c.hunt === id ? '🎯 Caçando' : '🎯 Caçar', () => {
            const no = huntBlocker(c, id);
            if (no) return toast(no);
            startHunt(c, id);
            toast(`Caçada aberta: o próximo encontro traz ${cr.name}.`);
            render();
          }, { class: c.hunt === id ? 'small primary' : 'small', disabled: c.hunt === id }),
        ),
      ),
    );
  }
}

/** Solenne: esquadrão parado aqui sara 2× mais rápido e recupera a moral. */
function renderInfirmary(c: Campaign, el: HTMLElement, squad: Squad | undefined): void {
  el.append(h('div', { class: 'muted', text: 'Os clérigos de Solenne cuidam de quem fica na capital: enquanto o esquadrão estiver parado aqui, ferimentos saram 2× mais rápido, todos se recuperam por completo e a moral volta ao normal a cada dia.' }));
  if (!squad) return;
  el.append(h('h3', { class: 'gold', style: 'margin-top:8px', text: `${squad.name} na enfermaria` }));
  for (const m of travelers(c, squad))
    el.append(h('div', { class: 'item row', style: 'justify-content:space-between' },
      h('span', { text: `${m.name}${squad.escort?.includes(m.id) ? ' (escolta)' : ''}` }),
      h('span', { class: 'muted', text: `${m.woundDays > 0 ? `ferido ${m.woundDays}d → ${Math.ceil(m.woundDays / 2)}d aqui` : 'apto'} · moral ${Math.round(m.morale ?? 70)}` }),
    ));
}

/** Bastiamar (armas e armaduras) e Cristália (itens mágicos): refino +1…+5. */
function renderRefine(c: Campaign, el: HTMLElement, sv: CapitalService, squad: Squad | undefined, capitalId: string, render: () => void): void {
  el.append(h('div', { class: 'muted', text: sv === 'refino' ? 'Os ferreiros de Bastiamar reforçam armas (+10% de ataque por nível) e armaduras e escudos (+12% de defesa por nível), até +5.' : 'Os magos de Cristália afinam acessórios e itens de joia de forja: +1 em cada bônus de atributo por nível, até +5.' }));
  const atBase = capitalId === c.baseNode;
  const rows: { label: string; id: string; swap: (nid: string) => void }[] = [];
  const team = [...(squad ? members(c, squad) : []), ...(atBase ? reserve(c) : [])];
  for (const m of team)
    for (const slot of ['weapon', 'offhand', 'armor', 'accessory'] as const) {
      const id = m.equipment[slot];
      if (id && refineService(id) === sv) rows.push({ label: `${m.name} · ${item(id).name}`, id, swap: (nid) => (m.equipment[slot] = nid) });
    }
  const bag = squad && !atBase ? squad.carried : c.inventory;
  for (const id of Object.keys(bag))
    if (refineService(id) === sv)
      rows.push({ label: `🎒 ${item(id).name}`, id, swap: (nid) => {
        bag[id] = (bag[id] ?? 0) - 1;
        if (bag[id]! <= 0) delete bag[id];
        bag[nid] = (bag[nid] ?? 0) + 1;
      } });
  if (!rows.length) el.append(h('div', { class: 'muted', style: 'margin-top:6px', text: 'Nada para refinar com o esquadrão presente.' }));
  for (const r of rows) {
    const why = refineBlocker(c, r.id, sv);
    const lvl = refineLevel(r.id);
    el.append(
      h('div', { class: 'item row', style: 'justify-content:space-between' },
        h('span', { text: r.label }),
        lvl >= 5 ? h('span', { class: 'gold', text: '+5 (máximo)' }) : btn(`${baseItemId(r.id) === r.id ? 'Refinar' : 'Refinar de novo'} → +${lvl + 1} (${refineCost(r.id)} 💰)`, () => {
          const nid = refineItem(c, r.id, sv);
          if (nid) {
            r.swap(nid);
            Audio.sfx('coin');
            toast(`${item(nid).name}!`);
          }
          render();
        }, { class: 'small', disabled: !!why, title: why ?? '' }),
      ),
    );
  }
}

/** Vel'Qadar: itens raros fora da lei e compra de espólio por mais. */
function renderBlackMarket(c: Campaign, el: HTMLElement, squad: Squad | undefined, capitalId: string, render: () => void): void {
  el.append(h('div', { class: 'muted', text: 'Ninguém pergunta de onde vem, ninguém pergunta para onde vai. O estoque muda todo mês.' }));
  const buyCol = h('div', { class: 'col' }, h('h3', { class: 'gold', text: 'Mercadorias' }));
  for (const id of blackMarketStock(c)) {
    const it = item(id);
    const price = blackMarketPrice(id);
    buyCol.append(
      h('div', { class: 'item row', style: 'justify-content:space-between' },
        h('div', {}, h('b', { text: it.name, style: `color:${RARITY_COLOR[it.rarity]}` }), h('span', { class: 'muted', text: ` · ${RARITY_LABEL[it.rarity]} · ${it.description}` })),
        btn(`${price} 💰`, () => (buyBlackMarket(c, capitalId === c.baseNode ? undefined : squad, id) && Audio.sfx('coin'), render()), { disabled: c.gold < price }),
      ),
    );
  }
  const lootBag = capitalId === c.baseNode || !squad ? c.materials : squad.loot;
  const sellCol = h('div', { class: 'col' }, h('h3', { class: 'gold', text: 'Compramos espólio (paga mais)' }));
  const loot = Object.entries(lootBag).filter(([, n]) => n > 0);
  if (!loot.length) sellCol.append(h('div', { class: 'muted', text: 'Nenhum material, troféu ou joia.' }));
  for (const [key, n] of loot) {
    const price = blackMarketLootPrice(c, key);
    sellCol.append(
      h('div', { class: 'item row', style: 'justify-content:space-between' },
        h('span', { text: `${lootName(key)} ×${n}` }),
        h('span', { class: 'row', style: 'gap:4px' },
          btn(`+${price}`, () => (sellLootBlackMarket(c, lootBag, key, 1), Audio.sfx('coin'), render()), { class: 'small' }),
          n > 1 ? btn(`Todos +${price * n}`, () => (sellLootBlackMarket(c, lootBag, key, n), Audio.sfx('coin'), render()), { class: 'small' }) : null,
        ),
      ),
    );
  }
  el.append(h('div', { class: 'grid2', style: 'grid-template-columns:1.4fr 1fr' }, buyCol, sellCol));
}
