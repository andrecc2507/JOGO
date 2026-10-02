import { bar, btn, clear, h, modal } from '@ui/dom';
import { ATTRS, ATTR_LABEL, ATTR_SHORT, DB, item, skill, type ClassId, type ItemSlot } from '../../data';
import {
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  allocate,
  canEquip,
  canPromote,
  derive,
  learnSkill,
  promote,
  statCost,
  xpToNext,
  type Character,
  type Equipment,
} from '../../rules/character';
import { suggestedClass } from '../../rules/recruit';
import { levelAttack } from '../../rules/stats';
import { jewelKey, lootName } from '../../rules/drops';
import { spriteFor } from '../../render/sprites';
import { RARITY_COLOR } from '../../world/encounters';
import { LOYALTY, loyaltyLabel, moraleLabel, talk, talkCooldown } from '../../world/loyalty';
import { ESCORT_MAX, SQUAD_MAX, addEscort, atBase, createSquad, dayOf, escorts, removeFromSquads, squadOfChar, disbandIfEmpty, giveItem, reserve, type Campaign, type Squad } from '../../world/campaign';
import { node } from '../../world/layout';
import { SKILL_MAX_RANK, classSkillIds, lockReason, mainSubclass, outfitKey, rankMult, rankOf, treeOf } from '../../rules/skill_tree';
import { nodeOfSkill } from '../../data';
import { describeSkill } from '../../bestiary/describe';
import { skillWeb } from '../shared/skill_web';

const BONUS_LABEL: Record<string, string> = { hp: 'HP', mp: 'MP', accuracy: 'acerto', speed: 'velocidade', magic: 'dano mágico', str: 'Força', dex: 'Destreza', int: 'Inteligência' };

/** Habilidade aberta no painel ao lado da teia (persiste entre redesenhos da ficha). */
let selectedSkill: string | null = null;

/** Painel da habilidade escolhida na teia: nível, efeito, motivo do bloqueio e o botão de aprender/fortalecer. */
function skillDetail(ch: Character, id: string | null, render: () => void): HTMLElement {
  const box = h('div', { class: 'item col', style: 'font-size:12px' });
  if (!id) {
    box.append(h('div', { class: 'muted', text: 'Clique numa habilidade da teia. Cada ponto ganho em batalha aprende uma habilidade (Nv 1) ou a fortalece, até o Nv 5.' }));
    return box;
  }
  const sk = skill(id);
  const node = nodeOfSkill(id);
  const rank = rankOf(ch, id);
  const why = lockReason(ch, id);
  const bonus = node ? [node.mpBonus ? `+${node.mpBonus} MP` : '', ...Object.entries(node.bonus ?? {}).filter(([, v]) => v).map(([k, v]) => `+${Math.round(v! * 100)}% ${BONUS_LABEL[k] ?? k}`)].filter(Boolean).join(' · ') : '';
  const pct = (r: number) => `${Math.round(rankMult(r) * 100)}%`;
  box.append(
    h('b', { class: sk.ultimate ? 'gold' : '', text: `${sk.ultimate ? '★ ' : ''}${sk.name}` }),
    h('div', { class: 'muted', text: `${node?.name ?? ''}${sk.mp ? ` · ${sk.mp} MP` : ''} · Nv ${rank}/${SKILL_MAX_RANK}` }),
    h('div', { text: sk.description }),
    node?.skills.some((s) => s.grantedBy === id) ? h('div', { class: 'gold', text: `Libera: ${node.skills.filter((s) => s.grantedBy === id).map((s) => s.name).join(', ')}` }) : '',
    node ? h('div', { class: 'muted', text: describeSkill(node.skills.find((s) => s.id === id)!) }) : '',
    h('div', { class: 'muted', text: rank ? `Poder atual ${pct(rank)}${rank < SKILL_MAX_RANK ? ` → ${pct(rank + 1)} no Nv ${rank + 1}` : ' (máximo)'}` : `Poder: Nv 1 ${pct(1)} · Nv ${SKILL_MAX_RANK} ${pct(SKILL_MAX_RANK)}` }),
    bonus && !ch.skills.some((s) => node?.skills.some((x) => x.id === s)) ? h('div', { class: 'gold', text: `1ª habilidade de ${node?.name}: ${bonus}` }) : '',
    why && why !== 'nível máximo'
      ? h('div', { style: 'color:#e57373', text: `🔒 ${why}` })
      : rank >= SKILL_MAX_RANK
        ? h('div', { class: 'gold', text: 'Nível máximo.' })
        : btn(rank ? `Fortalecer → Nv ${rank + 1} (1 ponto)` : 'Aprender (1 ponto)', () => (learnSkill(ch, id), render()), { class: 'primary', disabled: ch.skillPoints < 1 }),
  );
  return box;
}

function squadOf(c: Campaign, ch: Character): Squad | undefined {
  return squadOfChar(c, ch.id);
}

/** De onde vêm/para onde vão os itens ao trocar equipamento. */
function bagFor(c: Campaign, ch: Character): { bag: Record<string, number> | null; label: string } {
  const s = squadOf(c, ch);
  if (!s || atBase(c, s)) return { bag: c.inventory, label: 'inventário da base' };
  if (s.to) return { bag: null, label: 'esquadrão em viagem' };
  return { bag: s.carried, label: `carregado por ${s.name}` };
}

function portrait(ch: Character): HTMLCanvasElement {
  const cls = DB.classes[ch.classId];
  const img = spriteFor({ classId: ch.classId, beast: false, color: cls.color, dark: cls.dark, hairColor: ch.appearance.hairColor, hairStyle: ch.appearance.hairStyle, skin: ch.appearance.skin, outfit: outfitKey(ch) });
  const cv = document.createElement('canvas');
  cv.width = img.width * 5;
  cv.height = img.height * 5;
  cv.style.cssText = 'image-rendering:pixelated;background:rgba(0,0,0,0.3);border:1px solid #5a4a32;border-radius:4px';
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

/** Quartel: fichas, atributos (estilo Ragnarok), habilidades, promoção, equipamento, aparência e esquadrões. */
export function openBarracks(c: Campaign, onChange: () => void, focusId?: string): void {
  let selected = focusId ?? Object.keys(c.roster)[0] ?? '';
  modal(
    'Quartel — Personagens e Esquadrões',
    (body) => {
      const left = h('div', { class: 'col', style: 'max-height:70vh;overflow:auto' });
      const right = h('div', { class: 'col' });
      body.append(h('div', { class: 'grid2' }, left, right));
      const render = () => {
        clear(left);
        clear(right);
        const groups: [string, Character[], Squad | null][] = c.squads.flatMap((s): [string, Character[], Squad | null][] => [
          [`${s.name} ${s.to ? '(viajando)' : `— ${node(s.at).name}`}`, s.memberIds.map((id) => c.roster[id]!).filter(Boolean), s],
          ...(s.escort?.length ? [[`↳ Escolta de ${s.name} (não luta, sem XP)`, escorts(c, s), s] as [string, Character[], Squad | null]] : []),
        ]);
        groups.push([`Reserva (na base: ${node(c.baseNode).name})`, reserve(c), null]);
        for (const [title, list, sq] of groups) {
          left.append(h('h3', { class: 'gold', text: title, style: sq ? `color:${sq.color}` : '' }));
          if (!list.length) left.append(h('div', { class: 'muted', text: '—' }));
          for (const ch of list) {
            const d = derive(ch);
            left.append(
              h(
                'div',
                { class: `item ${ch.id === selected ? 'selected' : ''}`, onClick: () => ((selected = ch.id), render()) },
                h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: ch.name }), h('span', { class: 'muted', text: `${DB.classes[ch.classId].name} Nv ${ch.level}` })),
                bar(ch.hp, d.maxHp, '#66bb6a'),
                ch.woundDays > 0 ? h('span', { class: 'tag', style: 'color:#e57373', text: `ferido ${ch.woundDays}d` }) : null,
                ch.statPoints > 0 || ch.skillPoints > 0 ? h('span', { class: 'tag gold', text: `${ch.statPoints} pts atributo · ${ch.skillPoints} pts habilidade` }) : null,
              ),
            );
          }
        }
        const ch = c.roster[selected];
        if (ch) renderSheet(right, ch);
        renderSquadTools(left);
        renderLoot(left);
        onChange();
      };

      /** Espólio das feras: estoque da base e o que cada esquadrão carrega. */
      const renderLoot = (el: HTMLElement) => {
        const line = (bag: Record<string, number>) =>
          Object.entries(bag)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${k.startsWith('joia:') ? '💎 ' : ''}${lootName(k)} ×${n}`)
            .join(' · ');
        el.append(h('h3', { class: 'gold', style: 'margin-top:10px', text: '💎 Espólio' }), h('div', { class: 'muted', style: 'font-size:12px', text: `Base: ${line(c.materials) || 'vazio'}` }));
        for (const s of c.squads) if (Object.keys(s.loot).length) el.append(h('div', { class: 'muted', style: 'font-size:12px', text: `${s.name} carrega: ${line(s.loot)}` }));
        el.append(h('div', { class: 'muted', style: 'font-size:11px', text: 'Vende-se nas lojas das capitais; pesquisa e forja chegam com a base (fim do Ato 1).' }));
      };

      const renderSquadTools = (el: HTMLElement) => {
        const ch = c.roster[selected];
        if (!ch) return;
        const s = squadOf(c, ch);
        const tools = h('div', { class: 'col', style: 'margin-top:8px;border-top:1px solid #5a4a32;padding-top:6px' }, h('h3', { class: 'gold', text: 'Organizar esquadrões' }));
        const baseSquads = c.squads.filter((x) => atBase(c, x));
        const escorted = !!s?.escort?.includes(ch.id);
        if (s && atBase(c, s)) {
          tools.append(btn(`Mover ${ch.name} para a reserva`, () => (removeFromSquads(c, ch.id), disbandIfEmpty(c), render())));
          if (escorted)
            tools.append(btn('⚔ Passar para o combate', () => (removeFromSquads(c, ch.id), s.memberIds.push(ch.id), render()), { disabled: s.memberIds.length >= SQUAD_MAX }));
          else
            tools.append(btn('🛡 Passar para a escolta (viaja sem lutar)', () => (addEscort(c, s, ch.id), disbandIfEmpty(c), render()), { disabled: (s.escort?.length ?? 0) >= ESCORT_MAX || s.memberIds.length <= 1, title: s.memberIds.length <= 1 ? 'O esquadrão precisa de ao menos um combatente.' : '' }));
        }
        if (!s) {
          for (const bs of baseSquads) {
            tools.append(btn(`→ ${bs.name}`, () => {
              if (bs.memberIds.length < SQUAD_MAX) bs.memberIds.push(ch.id);
              render();
            }, { disabled: bs.memberIds.length >= SQUAD_MAX }));
            tools.append(btn(`→ ${bs.name} (escolta)`, () => (addEscort(c, bs, ch.id), render()), { disabled: (bs.escort?.length ?? 0) >= ESCORT_MAX }));
          }
          tools.append(h('div', { class: 'muted', style: 'font-size:11px', text: `Escolta: até ${ESCORT_MAX} feridos ou aprendizes viajam com o esquadrão, protegidos. Não lutam e não ganham XP.` }));
          tools.append(btn('Criar novo esquadrão com este personagem', () => (createSquad(c, [ch.id]), render())));
        }
        if (s) {
          const name = h('input', { value: s.name });
          name.addEventListener('change', () => ((s.name = name.value || s.name), render()));
          tools.append(h('div', { class: 'row' }, h('span', { class: 'muted', text: 'Nome do esquadrão:' }), name));
        }
        if (!baseSquads.length && !s) tools.append(h('div', { class: 'muted', text: 'Nenhum esquadrão na base agora.' }));
        el.append(tools);
      };

      const renderSheet = (el: HTMLElement, ch: Character) => {
        const d = derive(ch);
        const cls = DB.classes[ch.classId];
        const nameInput = h('input', { value: ch.name });
        nameInput.addEventListener('change', () => ((ch.name = nameInput.value || ch.name), render()));
        el.append(
          h(
            'div',
            { class: 'row', style: 'align-items:flex-start;gap:12px' },
            portrait(ch),
            h(
              'div',
              { class: 'col', style: 'flex:1' },
              h('div', { class: 'row' }, nameInput, h('b', { class: 'gold', text: `${cls.name}${mainSubclass(ch) ? ` (${mainSubclass(ch)!.name})` : ''} · Nível ${ch.level}` })),
              h('div', { class: 'muted', text: cls.role }),
              bar(ch.xp, xpToNext(ch.level), '#ab47bc', `XP ${ch.xp}/${xpToNext(ch.level)}`),
              bar(ch.hp, d.maxHp, '#66bb6a', `HP ${ch.hp}/${d.maxHp}`),
              bar(ch.mp, d.maxMp, '#42a5f5', `MP ${ch.mp}/${d.maxMp}`),
              loyaltyRow(c, ch, render),
              ch.woundDays > 0 ? h('div', { style: 'color:#e57373', text: `Ferido: afastado por ${ch.woundDays} dia(s).` }) : null,
              ch.jewel ? h('div', { style: 'color:#4fc3f7', text: `💎 ${lootName(jewelKey(ch.jewel.species))} Nv ${ch.jewel.rank}: ${DB.creatures[ch.jewel.species]?.skills.find((x) => x.id === DB.creatures[ch.jewel!.species]?.drops?.jewel.skill)?.name ?? '?'}` }) : null,
              appearanceEditor(ch, render),
            ),
          ),
        );
        // Promoção do Aprendiz.
        if (canPromote(ch)) {
          const sug = suggestedClass(ch);
          const row = h('div', { class: 'row' }, h('b', { class: 'gold', text: 'Escolha a classe:' }));
          for (const id of ['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao'] as ClassId[])
            row.append(btn(`${DB.classes[id].name}${id === sug ? ' ★' : ''}`, () => (promote(ch, id), render()), { class: id === sug ? 'primary' : '' }));
          el.append(row);
        } else if (ch.classId === 'aprendiz') el.append(h('div', { class: 'muted', text: 'Aprendiz: escolhe a classe ao chegar no nível 2.' }));
        // Atributos.
        const table = h('table', { class: 'stats' });
        for (const a of ATTRS) {
          const bonus = d.attrs[a] - ch.attrs[a];
          const cost = statCost(ch.attrs[a]);
          table.append(
            h(
              'tr',
              {},
              h('td', { text: ATTR_LABEL[a] }),
              h('td', { text: `${ch.attrs[a]}${bonus ? ` (${bonus > 0 ? '+' : ''}${bonus})` : ''}` }),
              h('td', { class: 'muted', text: `custo ${cost}` }),
              h('td', {}, btn('+', () => (allocate(ch, a), render()), { class: 'small', disabled: ch.statPoints < cost })),
            ),
          );
        }
        el.append(
          h(
            'div',
            { class: 'grid2', style: 'grid-template-columns:1fr 1fr' },
            h('div', {}, h('h3', { class: 'gold', text: `Atributos · ${ch.statPoints} pontos` }), table),
            h(
              'div',
              {},
              h('h3', { class: 'gold', text: 'Combate' }),
              h('table', { class: 'stats' },
                ...[
                  ['Ataque físico', `${d.weaponAtk + d.physPower + levelAttack(ch.level)} (arma ${d.weaponAtk} + ${ATTR_SHORT[d.attackAttr]} ${d.physPower} + nível ${levelAttack(ch.level)})`],
                  ['Ataque mágico', `${(d.weaponType === 'varinha' || d.weaponType === 'bastao' ? d.weaponAtk : 0) + d.magicPower + levelAttack(ch.level)} (arma ${d.weaponType === 'varinha' || d.weaponType === 'bastao' ? d.weaponAtk : 0} + INT ${d.magicPower} + nível ${levelAttack(ch.level)})`],
                  ['Alcance', d.weaponRange],
                  ['Armadura', d.def],
                  ['Resistência física', `${Math.round(d.physRes * 100)}%`],
                  ['Resistência mágica', `${Math.round(d.magicRes * 100)}%`],
                  ['Precisão / esquiva', `${Math.round(d.accuracy)} / ${Math.round(d.evasion)}`],
                  ['Crítico', `${d.crit}%`],
                  ['Ação a cada', `${d.actionInterval.toFixed(1)} s`],
                  ['Movimento / salto', `${d.move} / ${d.jump}`],
                ].map(([k, v]) => h('tr', {}, h('td', { text: String(k) }), h('td', { text: String(v) }))),
              ),
            ),
          ),
        );
        // Habilidades: teia da classe (clique numa habilidade para ver, aprender ou fortalecer).
        const skills = h('div', { class: 'col' }, h('h3', { class: 'gold', text: `Habilidades · ${ch.skillPoints} ponto(s)` }));
        const tree = treeOf(ch.classId);
        if (!tree) skills.append(h('div', { class: 'muted', text: 'Sem teia de habilidades (o Aprendiz escolhe a classe no nível 2).' }));
        else {
          if (!selectedSkill || !classSkillIds(ch.classId).includes(selectedSkill)) selectedSkill = null;
          const base = tree.nodes.find((n) => n.type === 'base');
          const passive = base?.skills[0];
          if (passive) skills.append(h('div', { class: 'item', style: 'font-size:12px' }, h('b', { class: 'gold', text: `◆ ${passive.name}` }), h('span', { class: 'muted', text: ` — ${passive.description}` })));
          skills.append(
            h('div', { class: 'row', style: 'align-items:flex-start;gap:10px;flex-wrap:wrap' },
              h('div', { style: 'flex:1 1 380px;min-width:300px;background:#10131c;border:1px solid #5a4a32;border-radius:6px;padding:6px' },
                skillWeb({
                  tree,
                  state: (id) => ({ rank: rankOf(ch, id), available: lockReason(ch, id) === null }),
                  selected: selectedSkill,
                  onPick: (id) => ((selectedSkill = id), render()),
                  maxWidth: 560,
                }),
                h('div', { class: 'muted', style: 'font-size:11px;text-align:center', text: 'Aceso: aprendida (número = nível) · contorno forte: disponível · apagado: bloqueado · ◆ suprema · tracejado: passiva' }),
              ),
              h('div', { style: 'flex:1 1 220px;min-width:200px' }, skillDetail(ch, selectedSkill, render)),
            ),
          );
        }
        el.append(skills);
        el.append(equipmentEditor(c, ch, render));
      };
      render();
    },
    { wide: true, onClose: onChange },
  );
}

/** Lealdade e moral (D76) e o botão de conversar (atenção do comandante). */
function loyaltyRow(c: Campaign, ch: Character, render: () => void): HTMLElement {
  const loyalty = Math.round(ch.loyalty ?? LOYALTY.start.loyalty);
  const morale = Math.round(ch.morale ?? LOYALTY.start.morale);
  const wait = talkCooldown(ch, dayOf(c));
  const squad = squadOfChar(c, ch.id);
  const here = !squad || atBase(c, squad) || !squad.to;
  return h(
    'div',
    { class: 'col' },
    bar(loyalty, 100, '#ffb300', `Lealdade ${loyalty} · ${loyaltyLabel(loyalty)}`),
    bar(morale, 100, morale < LOYALTY.daily.lowMorale ? '#e57373' : '#26a69a', `Moral ${morale} · ${moraleLabel(morale)}`),
    h(
      'div',
      { class: 'row' },
      btn('💬 Conversar', () => (talk(ch, dayOf(c)), render()), { class: 'small', disabled: wait > 0 || !here }),
      h('span', { class: 'muted', style: 'font-size:11px', text: wait > 0 ? `De novo em ${wait} dia(s).` : !here ? 'Só com o esquadrão parado.' : `+${LOYALTY.talk.loyalty} lealdade, +${LOYALTY.talk.morale} moral (a cada ${LOYALTY.talk.cooldownDays} dias).` }),
    ),
  );
}

function appearanceEditor(ch: Character, render: () => void): HTMLElement {
  const row = h('div', { class: 'col' });
  const styles = h('div', { class: 'row' }, h('span', { class: 'muted', text: 'Cabelo:' }));
  for (let i = 0; i < HAIR_STYLES; i++) styles.append(btn(String(i + 1), () => ((ch.appearance.hairStyle = i), render()), { class: `small ${ch.appearance.hairStyle === i ? 'active' : ''}` }));
  const hair = h('div', { class: 'row' }, h('span', { class: 'muted', text: 'Cor:' }));
  for (const col of HAIR_COLORS) hair.append(h('span', { class: `swatch ${ch.appearance.hairColor === col ? 'selected' : ''}`, style: `background:${col}`, onClick: () => ((ch.appearance.hairColor = col), render()) }));
  const skin = h('div', { class: 'row' }, h('span', { class: 'muted', text: 'Pele:' }));
  for (const col of SKIN_TONES) skin.append(h('span', { class: `swatch ${ch.appearance.skin === col ? 'selected' : ''}`, style: `background:${col}`, onClick: () => ((ch.appearance.skin = col), render()) }));
  row.append(styles, hair, skin);
  return row;
}

const SLOT_LABEL: Record<Exclude<keyof Equipment, 'utility'>, string> = { weapon: 'Arma', offhand: 'Mão secundária', armor: 'Armadura', accessory: 'Acessório' };
const SLOT_KIND: Record<Exclude<keyof Equipment, 'utility'>, ItemSlot> = { weapon: 'weapon', offhand: 'offhand', armor: 'armor', accessory: 'accessory' };

function equipmentEditor(c: Campaign, ch: Character, render: () => void): HTMLElement {
  const { bag, label } = bagFor(c, ch);
  const el = h('div', { class: 'col' }, h('h3', { class: 'gold', text: `Equipamento · itens do ${label}` }));
  const makeSelect = (current: string | null, kind: ItemSlot, onPick: (id: string | null) => void) => {
    const sel = h('select', {});
    sel.append(h('option', { value: '', text: '— vazio —' }));
    if (current) sel.append(h('option', { value: current, text: `${item(current).name} (equipado)` }));
    if (bag)
      for (const [id, n] of Object.entries(bag)) {
        const it = item(id);
        if (it.slot !== kind || id === current) continue;
        if (kind !== 'utility' && !canEquip(ch, id)) continue;
        sel.append(h('option', { value: id, text: `${it.name} ×${n}` }));
      }
    sel.value = current ?? '';
    sel.disabled = !bag;
    sel.addEventListener('change', () => onPick(sel.value || null));
    return sel;
  };
  const swap = (current: string | null, next: string | null): boolean => {
    if (!bag) return false;
    if (next && !bag[next]) return false;
    if (current) giveItem(bag, current, 1);
    if (next) giveItem(bag, next, -1);
    return true;
  };
  for (const key of Object.keys(SLOT_LABEL) as (keyof typeof SLOT_LABEL)[]) {
    const current = ch.equipment[key];
    const note = key === 'offhand' && !ch.canDualWield ? ' (requer habilidade que libere escudo/duas armas)' : '';
    el.append(
      h(
        'div',
        { class: 'row' },
        h('span', { style: 'min-width:110px', text: SLOT_LABEL[key] }),
        makeSelect(current, SLOT_KIND[key], (id) => {
          if (swap(current, id)) ch.equipment[key] = id;
          render();
        }),
        current ? h('span', { style: `color:${RARITY_COLOR[item(current).rarity]}`, class: 'muted', text: item(current).description }) : h('span', { class: 'muted', text: note }),
      ),
    );
  }
  ch.equipment.utility.forEach((current, i) => {
    el.append(
      h(
        'div',
        { class: 'row' },
        h('span', { style: 'min-width:110px', text: `Item de campo ${i + 1}` }),
        makeSelect(current, 'utility', (id) => {
          if (swap(current, id)) ch.equipment.utility[i] = id;
          render();
        }),
      ),
    );
  });
  if (!bag) el.append(h('div', { class: 'muted', text: 'Troque equipamentos quando o esquadrão estiver parado.' }));
  return el;
}
