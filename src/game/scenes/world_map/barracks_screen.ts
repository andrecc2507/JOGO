import { frictionLevel, frictionName, quirkLine } from '../../rules/personality';
import { equipmentTotals, itemStatLine } from '../shared/item_text';
import { attrSaveBar, attrTable, confirmPendingAttrs } from '../shared/attr_panel';
import { bar, btn, clear, h, modal, toast } from '@ui/dom';
import { ATTRS, ATTR_LABEL, ATTR_SHORT, DB, item, type ClassId, type ItemSlot } from '../../data';
import {
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  allocate,
  canEquip,
  canSpendAttr,
  canPromote,
  derive,
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
import { bark, ensureTrait, mood, traitOf } from '../../world/traits';
import { bondLevel, bondName } from '../../world/bonds';
import { STORY_KITS } from '../../data';
import { chronicleOf } from '../../world/chronicle';
import { ESCORT_MAX, SQUAD_COLORS, SQUAD_ICONS, SQUAD_MAX, addEscort, atBase, campaignRng, createSquad, dayOf, depositCarried, escorts, fitMembers, members, removeFromSquads, squadById, squadOfChar, disbandIfEmpty, giveItem, reserve, type Campaign, type Squad } from '../../world/campaign';
import { node } from '../../world/layout';
import { buildLabel, classSkillIds, outfitKey, treeOf } from '../../rules/skill_tree';
import { openEvolve } from '../shared/evolve_screen';

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

/** Onde o Quartel está: lista de esquadrões, um esquadrão (ou a reserva) ou a ficha de um herói. */
type BarracksView = { kind: 'squads' } | { kind: 'squad'; id: string } | { kind: 'hero'; id: string };

const RESERVE = 'reserva';

/**
 * Quartel: abre na lista de esquadrões (criar, editar, desfazer); um esquadrão mostra os heróis
 * (combatentes e escolta); um herói abre a ficha (atributos, habilidades, equipamento, aparência).
 */
export function openBarracks(c: Campaign, onChange: () => void, focusId?: string): void {
  let view: BarracksView = focusId && c.roster[focusId] ? { kind: 'hero', id: focusId } : { kind: 'squads' };
  modal(
    'Quartel',
    (body, m) => {
      (m.el.firstElementChild as HTMLElement).classList.add('barracks');
      const go = (v: BarracksView) => {
        view = v;
        render();
        body.scrollTop = 0;
      };
      const render = () => {
        clear(body);
        body.append(crumbs());
        if (view.kind === 'squads') renderSquads(body);
        else if (view.kind === 'squad') renderSquad(body, view.id);
        else {
          const ch = c.roster[view.id];
          if (ch) renderSheet(body, ch);
          else return go({ kind: 'squads' });
        }
        onChange();
      };

      /** Trilha: Esquadrões › Esquadrão › Herói. */
      const crumbs = () => {
        const el = h('div', { class: 'crumbs' });
        const link = (text: string, v: BarracksView) => h('a', { text, onClick: () => go(v) });
        el.append(view.kind === 'squads' ? h('span', { style: 'color:#ead6ad', text: 'Esquadrões' }) : link('Esquadrões', { kind: 'squads' }));
        const sqId = view.kind === 'squad' ? view.id : view.kind === 'hero' ? squadOf(c, c.roster[view.id]!)?.id ?? RESERVE : null;
        if (sqId) {
          const name = sqId === RESERVE ? 'Reserva' : squadById(c, sqId)?.name ?? '?';
          el.append(h('span', { text: '›' }), view.kind === 'squad' ? h('span', { style: 'color:#ead6ad', text: name }) : link(name, { kind: 'squad', id: sqId }));
        }
        if (view.kind === 'hero') el.append(h('span', { text: '›' }), h('span', { style: 'color:#ead6ad', text: c.roster[view.id]?.name ?? '' }));
        return el;
      };

      const status = (s: Squad) => (s.to ? `marchando para ${node(s.route[s.route.length - 1] ?? s.to).name}` : atBase(c, s) ? `na base · ${node(s.at).name}` : `em ${node(s.at).name}${s.resting ? ' (estalagem)' : ''}`);

      /** 1) Lista de esquadrões + reserva + novo esquadrão + espólio. */
      const renderSquads = (el: HTMLElement) => {
        const grid = h('div', { class: 'card-grid' });
        for (const s of c.squads) {
          const fit = fitMembers(c, s).length;
          const faces = h('div', { class: 'sc-faces' }, ...[...members(c, s), ...escorts(c, s)].map((ch) => portrait(ch)));
          grid.append(
            h('div', { class: 'squad-card', onClick: () => go({ kind: 'squad', id: s.id }) },
              h('div', { class: 'sc-banner', style: `background:${s.color}` }),
              h('div', { class: 'sc-title', text: `${s.icon ? `${s.icon} ` : ''}${s.name}` }),
              h('div', { class: 'muted', style: 'font-size:12px', text: status(s) }),
              faces,
              h('div', {},
                h('span', { class: 'badge', text: `⚔ ${s.memberIds.length}/${SQUAD_MAX}` }),
                s.escort?.length ? h('span', { class: 'badge', text: `🛡 ${s.escort.length}` }) : '',
                fit < s.memberIds.length ? h('span', { class: 'badge warn', text: `${s.memberIds.length - fit} ferido(s)` }) : '',
                members(c, s).some((x) => canSpendAttr(x) || x.skillPoints > 0) ? h('span', { class: 'badge up', text: 'pontos a distribuir' }) : '',
              ),
            ),
          );
        }
        const res = reserve(c);
        grid.append(
          h('div', { class: 'squad-card', onClick: () => go({ kind: 'squad', id: RESERVE }) },
            h('div', { class: 'sc-banner', style: 'background:#5d5243' }),
            h('div', { class: 'sc-title', text: 'Reserva' }),
            h('div', { class: 'muted', style: 'font-size:12px', text: `na base · ${node(c.baseNode).name}` }),
            h('div', { class: 'sc-faces' }, ...res.slice(0, 12).map((ch) => portrait(ch))),
            h('div', {}, h('span', { class: 'badge', text: `${res.length} herói(s)` })),
          ),
          h('div', { class: 'squad-card new', onClick: () => newSquadDialog() }, h('div', { text: '＋ NOVO ESQUADRÃO' })),
        );
        el.append(grid);
        renderLoot(el);
      };

      /** Novo esquadrão: escolhe os heróis da reserva (na base). */
      const newSquadDialog = () => {
        const res = reserve(c);
        modal('Novo esquadrão', (b2, m2) => {
          if (!res.length) {
            b2.append(h('div', { class: 'muted', text: 'Não há heróis na reserva. Desfaça um esquadrão ou recrute nas capitais.' }));
            return;
          }
          const picked = new Set<string>();
          const list = h('div', { class: 'col' });
          const draw = () => {
            clear(list);
            for (const ch of res)
              list.append(
                h('div', { class: `item row ${picked.has(ch.id) ? 'selected' : ''}`, style: 'gap:8px', onClick: () => (picked.has(ch.id) ? picked.delete(ch.id) : picked.size < SQUAD_MAX && picked.add(ch.id), draw()) },
                  portrait(ch), h('div', {}, h('b', { text: ch.name }), h('div', { class: 'muted', style: 'font-size:12px', text: `${buildLabel(ch)} · Nv ${ch.level}` })),
                ),
              );
          };
          draw();
          b2.append(
            h('div', { class: 'muted', style: 'margin-bottom:6px', text: `Escolha até ${SQUAD_MAX} heróis da reserva. O esquadrão começa na base.` }),
            list,
            h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:8px' },
              btn('Cancelar', () => m2.close()),
              btn('Criar esquadrão', () => {
                if (!picked.size) return;
                const s = createSquad(c, [...picked]);
                m2.close();
                if (s) go({ kind: 'squad', id: s.id });
              }, { class: 'primary' }),
            ),
          );
        });
      };

      /** Cartão de herói (clique abre a ficha). */
      const heroCard = (ch: Character, actions: HTMLElement[] = []) => {
        const d = derive(ch);
        return h('div', { class: 'hero-card', onClick: () => go({ kind: 'hero', id: ch.id }) },
          portrait(ch),
          h('div', { class: 'col', style: 'flex:1;min-width:0;gap:3px' },
            h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'hc-name', text: ch.name }), h('span', { class: 'muted', style: 'font-size:12px', text: `Nv ${ch.level}` })),
            h('div', { class: 'hc-build', text: buildLabel(ch) }),
            bar(ch.hp, d.maxHp, '#7a2a24', `HP ${ch.hp}/${d.maxHp}`),
            h('div', {},
              ch.woundDays > 0 ? h('span', { class: 'badge warn', text: `${ch.severeWound ? 'grave' : 'ferido'} ${ch.woundDays}d` }) : '',
              canSpendAttr(ch) ? h('span', { class: 'badge up', text: `${ch.statPoints} atributo` }) : '',
              ch.skillPoints > 0 ? h('span', { class: 'badge up', text: `${ch.skillPoints} habilidade` }) : '',
            ),
            actions.length ? h('div', { class: 'row', style: 'gap:4px', onClick: (e: Event) => e.stopPropagation() }, ...actions) : '',
          ),
        );
      };

      /** 2) Um esquadrão (ou a reserva): heróis, edição, desfazer. */
      const renderSquad = (el: HTMLElement, id: string) => {
        if (id === RESERVE) {
          const baseSquads = c.squads.filter((x) => atBase(c, x));
          el.append(h('div', { class: 'section-title', text: `RESERVA · ${node(c.baseNode).name}` }));
          const grid = h('div', { class: 'card-grid' });
          for (const ch of reserve(c))
            grid.append(heroCard(ch, baseSquads.flatMap((bs) => [
              btn(`→ ${bs.name}`, () => (bs.memberIds.push(ch.id), render()), { class: 'small', disabled: bs.memberIds.length >= SQUAD_MAX }),
              btn('🛡', () => (addEscort(c, bs, ch.id), render()), { class: 'small', title: `Escolta de ${bs.name} (viaja sem lutar)`, disabled: (bs.escort?.length ?? 0) >= ESCORT_MAX }),
            ])));
          if (!reserve(c).length) grid.append(h('div', { class: 'muted', text: 'Ninguém na reserva.' }));
          el.append(grid);
          if (!baseSquads.length) el.append(h('div', { class: 'muted', style: 'margin-top:8px', text: 'Nenhum esquadrão na base para receber heróis da reserva agora.' }));
          return;
        }
        const s = squadById(c, id);
        if (!s) return go({ kind: 'squads' });
        const here = atBase(c, s);
        // Cabeçalho: nome, estandarte, situação, desfazer.
        const name = h('input', { value: s.name, style: 'font-family:var(--font-display);font-size:16px;width:240px' });
        name.addEventListener('change', () => ((s.name = name.value || s.name), render()));
        const icons = h('div', { class: 'row', style: 'gap:2px' });
        for (const ic of SQUAD_ICONS) icons.append(btn(ic || '—', () => ((s.icon = ic), render()), { class: `small ${(s.icon ?? '') === ic ? 'active' : ''}` }));
        const colors = h('div', { class: 'row', style: 'gap:4px' });
        for (const col of SQUAD_COLORS) colors.append(h('span', { class: `swatch ${s.color === col ? 'selected' : ''}`, style: `background:${col}`, onClick: () => ((s.color = col), render()) }));
        el.append(
          h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
            h('div', { class: 'col' },
              h('div', { class: 'row' }, h('span', { style: `display:inline-block;width:6px;height:28px;background:${s.color}` }), name),
              h('div', { class: 'muted', text: status(s) }),
            ),
            btn('Desfazer esquadrão', () => disbandDialog(s), { class: 'danger', disabled: !here, title: here ? 'Os heróis voltam para a reserva.' : 'Só na base.' }),
          ),
          h('div', { class: 'row', style: 'margin:8px 0;gap:14px' }, h('span', { class: 'muted', text: 'Estandarte' }), icons, colors),
        );
        el.append(h('div', { class: 'section-title', text: `COMBATENTES · ${s.memberIds.length}/${SQUAD_MAX}` }));
        const fighters = h('div', { class: 'card-grid' });
        for (const ch of members(c, s))
          fighters.append(heroCard(ch, here ? [
            btn('→ Reserva', () => (removeFromSquads(c, ch.id), disbandIfEmpty(c), render()), { class: 'small' }),
            btn('🛡 Escolta', () => (addEscort(c, s, ch.id), render()), { class: 'small', disabled: (s.escort?.length ?? 0) >= ESCORT_MAX || s.memberIds.length <= 1 }),
          ] : []));
        el.append(fighters);
        el.append(h('div', { class: 'section-title', text: `ESCOLTA · ${s.escort?.length ?? 0}/${ESCORT_MAX} · não lutam, sem XP` }));
        const esc = h('div', { class: 'card-grid' });
        for (const ch of escorts(c, s))
          esc.append(heroCard(ch, here ? [
            btn('→ Reserva', () => (removeFromSquads(c, ch.id), render()), { class: 'small' }),
            btn('⚔ Combate', () => (removeFromSquads(c, ch.id), s.memberIds.push(ch.id), render()), { class: 'small', disabled: s.memberIds.length >= SQUAD_MAX }),
          ] : []));
        if (!s.escort?.length) esc.append(h('div', { class: 'muted', text: 'Feridos e aprendizes podem viajar aqui, protegidos.' }));
        el.append(esc);
        if (here && reserve(c).length) {
          el.append(h('div', { class: 'section-title', text: 'ADICIONAR DA RESERVA' }));
          const add = h('div', { class: 'card-grid' });
          for (const ch of reserve(c))
            add.append(heroCard(ch, [
              btn('＋ Combate', () => (s.memberIds.push(ch.id), render()), { class: 'small', disabled: s.memberIds.length >= SQUAD_MAX }),
              btn('＋ Escolta', () => (addEscort(c, s, ch.id), render()), { class: 'small', disabled: (s.escort?.length ?? 0) >= ESCORT_MAX }),
            ]));
          el.append(add);
        } else if (!here) el.append(h('div', { class: 'muted', style: 'margin-top:8px', text: 'Trocas de heróis só com o esquadrão na base.' }));
      };

      const disbandDialog = (s: Squad) =>
        modal('Desfazer esquadrão', (b2, m2) => {
          b2.append(
            h('div', { style: 'margin-bottom:10px', text: `Desfazer ${s.name}? Os heróis voltam para a reserva e os itens carregados vão para o inventário da base.` }),
            h('div', { class: 'row', style: 'justify-content:flex-end' },
              btn('Cancelar', () => m2.close()),
              btn('Desfazer', () => {
                depositCarried(c, s);
                for (const id of [...s.memberIds, ...(s.escort ?? [])]) removeFromSquads(c, id);
                disbandIfEmpty(c);
                m2.close();
                go({ kind: 'squads' });
              }, { class: 'danger' }),
            ),
          );
        });

      /** Espólio das feras: estoque da base e o que cada esquadrão carrega. */
      const renderLoot = (el: HTMLElement) => {
        const line = (bag: Record<string, number>) =>
          Object.entries(bag)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${k.startsWith('joia:') ? '💎 ' : ''}${lootName(k)} ×${n}`)
            .join(' · ');
        el.append(h('div', { class: 'section-title', text: 'ESPÓLIO' }), h('div', { class: 'muted', style: 'font-size:12px', text: `Base: ${line(c.materials) || 'vazio'}` }));
        for (const s of c.squads) if (Object.keys(s.loot).length) el.append(h('div', { class: 'muted', style: 'font-size:12px', text: `${s.name} carrega: ${line(s.loot)}` }));
      };

      /** 3) Ficha do herói. */
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
              h('div', { class: 'row' }, nameInput, h('b', { class: 'gold', text: `${cls.name} · Nível ${ch.level}` }), btn(`✦ Evoluir${ch.skillPoints || ch.statPoints ? ' •' : ''}`, () => openEvolve(ch, render, Object.values(c.roster)), { class: 'small primary' })),
              h('div', { class: 'gold', style: 'font-size:12px', text: `✦ ${buildLabel(ch)}` }),
              kitBlock(ch),
              h('div', { class: 'muted', text: cls.role }),
              bar(ch.xp, xpToNext(ch.level), '#5e3a70', `XP ${ch.xp}/${xpToNext(ch.level)}`),
              bar(ch.hp, d.maxHp, '#7a2a24', `HP ${ch.hp}/${d.maxHp}`),
              bar(ch.mp, d.maxMp, '#2c4f7a', `MP ${ch.mp}/${d.maxMp}`),
              loyaltyRow(c, ch, render),
              historyBlock(c, ch),
              ch.woundDays > 0 ? h('div', { style: 'color:#e57373', text: ch.severeWound ? `Ferido grave: fora de combate por ${ch.woundDays} dia(s).` : `Ferido: luta com −25% de vida máxima por ${ch.woundDays} dia(s).` }) : null,
              ...(ch.jewels ?? []).map((jw, i) => h('div', { style: 'color:#4fc3f7', text: `💎 Orbe ${i + 1}: ${lootName(jewelKey(jw.species))} Nv ${jw.rank} · ${DB.creatures[jw.species]?.skills.find((x) => x.id === DB.creatures[jw.species]?.drops?.jewel.skill)?.name ?? '?'}` })),
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
        const table = h('div', {}, attrTable(ch, render, { bonus: d.attrs }), attrSaveBar(ch, render));
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
        // Habilidades: a teia fica na tela cheia "Evoluir".
        const tree = treeOf(ch.classId);
        const learnedCount = ch.skills.filter((id) => classSkillIds(ch.classId).includes(id)).length;
        const base = tree?.nodes.find((n) => n.type === 'base');
        const passive = base?.skills[0];
        const skills = h('div', { class: 'item col', style: 'background:radial-gradient(ellipse at center,#14204a,#070b1a);border:1px solid #c9a14a;margin-top:8px' },
          h('div', { class: 'row', style: 'justify-content:space-between' },
            h('h3', { class: 'gold', style: 'margin:0', text: `✦ Teia de habilidades · ${ch.skillPoints} ponto(s)` }),
            btn('✦ Evoluir', () => openEvolve(ch, render, Object.values(c.roster)), { class: 'primary' }),
          ),
          h('div', { class: 'muted', style: 'font-size:12px', text: tree ? `${learnedCount} habilidade(s) aprendida(s). Abra "Evoluir" para ver a teia em tela cheia, aprender, fortalecer e distribuir atributos.` : 'O Aprendiz escolhe a classe no nível 2 (em "Evoluir").' }),
          passive ? h('div', { style: 'font-size:12px' }, h('b', { class: 'gold', text: `◆ ${passive.name}` }), h('span', { class: 'muted', text: ` — ${passive.description}` })) : '',
        );
        el.append(skills);
        el.append(equipmentEditor(c, ch, render));
      };
      render();
    },
    { wide: true, onClose: () => confirmPendingAttrs(Object.values(c.roster), onChange) },
  );
}

/** Kit único dos personagens da história: título, habilidades e a suprema da missão pessoal. */
function kitBlock(ch: Character): HTMLElement | null {
  const kit = ch.storyId ? STORY_KITS[ch.storyId] : undefined;
  if (!kit) return null;
  const sk = (id: string) => DB.skills[id];
  return h('div', { class: 'kit-block' },
    h('div', {}, h('b', { class: 'gold', text: `◆ ${kit.title}` }), h('span', { class: 'muted', text: ` — ${kit.desc}` })),
    ...kit.skills.map((id) => h('div', { style: 'font-size:12px', title: sk(id)?.description ?? '', text: `• ${sk(id)?.name ?? id}${sk(id)?.passive ? ' (passiva)' : ''}: ${sk(id)?.description ?? ''}` })),
    h('div', { style: `font-size:12px;${ch.kitUltimate ? '' : 'opacity:0.55'}`, text: `${ch.kitUltimate ? '★' : '🔒'} ${sk(kit.ultimate)?.name ?? ''}: ${ch.kitUltimate ? sk(kit.ultimate)?.description ?? '' : 'liberada na missão pessoal.'}` }),
  );
}

/** Títulos, vínculos, juramentos e a crônica pessoal do herói. */
function historyBlock(c: Campaign, ch: Character): HTMLElement {
  const bonds = Object.entries(ch.bonds ?? {})
    .map(([id, p]) => ({ other: c.roster[id], lv: bondLevel(p) }))
    .filter((b) => b.lv > 0)
    .sort((a, b) => b.lv - a.lv);
  const lost = Object.entries(ch.bonds ?? {}).filter(([id, p]) => !c.roster[id] && bondLevel(p) >= 2).length;
  const deeds = chronicleOf(c, ch.id).slice(0, 4);
  const rivals = Object.entries(ch.friction ?? {})
    .map(([id, p]) => ({ other: c.roster[id], lv: frictionLevel(p) }))
    .filter((r) => r.lv > 0 && r.other);
  return h('div', { class: 'col', style: 'gap:2px;font-size:12px;margin-top:4px' },
    h('div', {}, h('span', { class: 'muted', text: 'Personalidade: ' }), h('span', { text: quirkLine(ch) })),
    rivals.length ? h('div', { style: 'color:#ffb74d', text: `⚡ Atrito: ${rivals.map((r) => `${r.other!.name} (${frictionName(r.lv)})`).join(' · ')} — lado a lado: ${rivals.some((r) => r.lv >= 2) ? 'Desafetos atrapalham' : 'Rivais competem'}` }) : null,
    ch.titles?.length ? h('div', {}, h('span', { class: 'muted', text: 'Títulos: ' }), h('b', { class: 'gold', text: ch.titles.join(' · ') })) : null,
    bonds.length ? h('div', {}, h('span', { class: 'muted', text: 'Vínculos: ' }), h('span', { text: bonds.map((b) => `${b.other?.name ?? '?'} (${bondName(b.lv)})`).join(' · ') })) : null,
    lost ? h('div', { class: 'muted', text: `Perdeu ${lost} companheiro(s) próximo(s) nesta guerra.` }) : null,
    ch.vendetta?.length ? h('div', { style: 'color:#ff8a65', text: `⚔ Juramento: vingar ${ch.vendetta.map((v) => `${v.for} contra ${v.name}`).join('; ')} (+15% de dano)` }) : null,
    ...deeds.map((e) => h('div', { class: 'muted', text: `Dia ${e.day}: ${e.text}` })),
  );
}

/** Lealdade e moral (D76) e o botão de conversar (atenção do comandante). */
function loyaltyRow(c: Campaign, ch: Character, render: () => void): HTMLElement {
  const loyalty = Math.round(ch.loyalty ?? LOYALTY.start.loyalty);
  const morale = Math.round(ch.morale ?? LOYALTY.start.morale);
  const wait = talkCooldown(ch, dayOf(c));
  const squad = squadOfChar(c, ch.id);
  const here = !squad || atBase(c, squad) || !squad.to;
  const trait = traitOf(ensureTrait(ch));
  const m = mood(loyalty);
  return h(
    'div',
    { class: 'col' },
    trait ? h('div', { style: 'font-size:12px' }, h('b', { class: 'gold', text: `Traço: ${trait.name}` }), h('span', { class: 'muted', text: ` — ${trait.desc}` })) : null,
    h('div', { class: 'muted', style: 'font-size:11px', text: m === 'loyal' ? 'Leal: nas batalhas, apoia o comandante.' : m === 'bitter' ? 'Ressentido: reclama das ordens. Abaixo de 30 de lealdade, pode abandonar você na hora decisiva.' : 'Neutro: segue ordens sem paixão.' }),
    bar(loyalty, 100, '#8a6a28', `Lealdade ${loyalty} · ${loyaltyLabel(loyalty)}`),
    bar(morale, 100, morale < LOYALTY.daily.lowMorale ? '#7a2a24' : '#3d6b5e', `Moral ${morale} · ${moraleLabel(morale)}`),
    h(
      'div',
      { class: 'row' },
      btn('💬 Conversar', () => {
        talk(ch, dayOf(c));
        const line = bark(ch.trait, 'victory', ch.loyalty ?? 50, campaignRng(c));
        if (line) toast(`${ch.name}: “${line}”`, 3500);
        render();
      }, { class: 'small', disabled: wait > 0 || !here }),
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
  // Cada espaço: o que está equipado (números e descrição) e a troca logo abaixo.
  const slotCard = (label: string, current: string | null, picker: HTMLElement, note = '') => {
    const it = current ? item(current) : null;
    return h('div', { class: 'item', style: 'padding:6px 8px' },
      h('div', { class: 'row', style: 'justify-content:space-between;gap:8px' },
        h('span', {}, h('span', { class: 'muted', text: `${label}: ` }), it ? h('b', { style: `color:${RARITY_COLOR[it.rarity]}`, text: it.name }) : h('span', { class: 'muted', text: '— vazio —' })),
        picker,
      ),
      it ? h('div', { class: 'gold', style: 'font-size:12px', text: itemStatLine(it) }) : '',
      it ? h('div', { class: 'muted', style: 'font-size:12px', text: it.description }) : note ? h('div', { class: 'muted', style: 'font-size:12px', text: note }) : '',
    );
  };
  const worn = [ch.equipment.weapon, ch.equipment.offhand, ch.equipment.armor, ch.equipment.accessory].filter((x): x is string => !!x).map(item);
  el.append(h('div', { class: 'muted', text: `Total do equipamento: ${equipmentTotals(worn)}` }));
  for (const key of Object.keys(SLOT_LABEL) as (keyof typeof SLOT_LABEL)[]) {
    const current = ch.equipment[key];
    const note = key === 'offhand' && !ch.canDualWield ? 'Requer habilidade que libere escudo/duas armas.' : '';
    el.append(
      slotCard(SLOT_LABEL[key], current, makeSelect(current, SLOT_KIND[key], (id) => {
        if (swap(current, id)) ch.equipment[key] = id;
        render();
      }), note),
    );
  }
  ch.equipment.utility.forEach((current, i) => {
    el.append(
      slotCard(`Item de campo ${i + 1}`, current, makeSelect(current, 'utility', (id) => {
        if (swap(current, id)) ch.equipment.utility[i] = id;
        render();
      })),
    );
  });
  if (!bag) el.append(h('div', { class: 'muted', text: 'Troque equipamentos quando o esquadrão estiver parado.' }));
  return el;
}
