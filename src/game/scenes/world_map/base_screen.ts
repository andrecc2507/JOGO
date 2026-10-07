import { ACADEMY, CAPTAINS, CAPTAIN_SKILLS, learnBlock, learnCaptainSkill, type CaptainSkill } from '../../world/captains';
import { btn, clear, h, modal, toast } from '@ui/dom';
import { buildLabel } from '../../rules/skill_tree';
import { DB, item } from '../../data';
import { Audio } from '../../audio/audio';
import { jewelKey, lootName } from '../../rules/drops';
import { capitals, node } from '../../world/layout';
import { addLog, reserve, type Campaign } from '../../world/campaign';
import {
  FACILITIES,
  RECIPES,
  assign,
  baseSlots,
  buildBlocker,
  craftBlocker,
  foundBase,
  hideout,
  hideoutFor,
  recipeGold,
  recipeUnlocked,
  researchName,
  researchOptions,
  startBuilding,
  startCraft,
  startResearch,
  usedSlots,
  workReduction,
  workers,
  equipBlocker,
  equipJewel,
  JEWEL_SLOTS,
  jewelKnown,
  jewelMinLevel,
  magicItemBlocker,
  magicItemCost,
  startMagicItem,
  strengthenBlocker,
  strengthenCost,
  strengthenJewel,
  unequipJewel,
  type Job,
  type WorkKind,
} from '../../world/base';

const days = (d: number) => (d >= 1 ? `${Math.ceil(d * 10) / 10} d` : `${Math.ceil(d * 24)} h`);

function progress(job: Job): HTMLElement {
  const pct = Math.round((1 - Math.max(0, job.remaining) / job.total) * 100);
  return h('div', { style: 'height:6px;background:#0008;border-radius:3px;overflow:hidden;margin-top:3px' }, h('div', { style: `height:100%;width:${pct}%;background:#ffd54f` }));
}

/** Escolha do esconderijo (fim do Ato 1): cada capital dá um bônus. */
export function openHideoutChoice(c: Campaign, onDone: () => void): void {
  modal('Escolha o esconderijo da resistência', (body, self) => {
    body.append(h('div', { class: 'muted', style: 'margin-bottom:6px', text: 'Desertor do reino, você precisa de uma base. A capital escolhida vira o esconderijo: Quartel, Biblioteca (pesquisa) e Forja prontos, e um bônus próprio.' }));
    for (const cap of capitals()) {
      const country = DB.countries.find((x) => x.id === cap.countryId)!;
      const bonus = hideoutFor(cap.id);
      body.append(
        h('div', { class: 'item row', style: 'justify-content:space-between' },
          h('div', {}, h('b', { text: `${cap.name} — ${country.name}, ${country.epithet}` }), h('div', { class: 'muted', text: `Senhor(a): ${country.lord}` }), bonus ? h('div', { class: 'gold', text: `${bonus.label}: ${bonus.text}` }) : null),
          btn('Escolher', () => {
            for (const m of foundBase(c, cap.id)) addLog(c, m);
            Audio.sfx('coin');
            self.close();
            toast(`Esconderijo em ${cap.name}.`);
            onDone();
          }, { class: 'primary' }),
        ),
      );
    }
  });
}

/** Base da resistência: instalações, Biblioteca (pesquisa), Forja e heróis trabalhando. */
export type BaseTab = 'instalacoes' | 'pesquisa' | 'forja' | 'joias' | 'trabalho';

export function openBase(c: Campaign, onChange: () => void, initial: BaseTab = 'pesquisa'): void {
  if (!c.base) return;
  let tab: BaseTab = initial;
  modal(
    `Base — ${node(c.base.nodeId).name}`,
    (body) => {
      const head = h('div', { class: 'gold', style: 'margin-bottom:6px' });
      const tabs = h('div', { class: 'tabs' });
      const content = h('div', {});
      body.append(head, tabs, content);
      const render = () => {
        const b = c.base!;
        const hz = hideout(c);
        head.textContent = `💰 ${c.gold} ouro · espaços ${usedSlots(c)}/${baseSlots(c)}${hz ? ` · ${hz.label}: ${hz.text}` : ''}`;
        clear(tabs);
        for (const [id, label] of [
          ['pesquisa', '📚 Biblioteca'],
          ['forja', '⚒ Forja'],
          ['joias', '💎 Joias'],
          ['trabalho', '👥 Trabalho'],
          ['instalacoes', '🏗 Instalações'],
        ] as const)
          tabs.append(btn(label, () => ((tab = id), render()), { class: tab === id ? 'active' : '' }));
        clear(content);
        if (tab === 'pesquisa') {
          const rq = b.research.queue;
          content.append(h('h3', { class: 'gold', text: `Em andamento (${Math.round(workReduction(c, 'pesquisa') * 100)}% mais rápido com ${workers(c, 'pesquisa').length} herói(s))` }));
          if (!rq.length) content.append(h('div', { class: 'muted', text: 'Nada sendo pesquisado.' }));
          rq.forEach((j, i) => content.append(h('div', { class: 'item' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: `${i === 0 ? '▶ ' : ''}${researchName(j.id)}` }), h('span', { class: 'muted', text: `falta ${days(j.remaining)}` })), progress(j))));
          const opts = researchOptions(c);
          content.append(h('h3', { class: 'gold', style: 'margin-top:8px', text: 'Pesquisas possíveis' }));
          if (!opts.length) content.append(h('div', { class: 'muted', text: 'Derrote feras e traga materiais para estudar. Estudo de criatura pede abates da espécie.' }));
          for (const o of opts)
            content.append(
              h('div', { class: 'item row', style: 'justify-content:space-between' },
                h('div', {},
                  h('b', { text: o.name }),
                  h('div', { class: 'muted', style: 'font-size:12px', text: `${o.result} · ${o.days} dias · custo: ${Object.entries(o.cost).map(([k, n]) => `${lootName(k)} ×${n}`).join(', ') || '—'}` }),
                  o.missing ? h('div', { style: 'color:#ff8a80;font-size:12px', text: `Falta: ${o.missing}` }) : null,
                ),
                btn('Pesquisar', () => (startResearch(c, o.id, opts), render()), { disabled: !o.ready }),
              ),
            );
          if (b.research.done.length) content.append(h('h3', { class: 'gold', style: 'margin-top:8px', text: `Concluídas (${b.research.done.length})` }), h('div', { class: 'muted', style: 'font-size:12px', text: b.research.done.map(researchName).join(' · ') }));
        } else if (tab === 'forja') {
          content.append(h('h3', { class: 'gold', text: `Fila (${Math.round(workReduction(c, 'forja') * 100)}% mais rápido com ${workers(c, 'forja').length} herói(s))` }));
          if (!b.forge.length) content.append(h('div', { class: 'muted', text: 'Forja parada.' }));
          b.forge.forEach((j, i) => {
            const r = RECIPES.find((x) => x.id === j.id);
            content.append(h('div', { class: 'item' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: `${i === 0 ? '▶ ' : ''}${r ? item(r.output).name : j.id}` }), h('span', { class: 'muted', text: `falta ${days(j.remaining)}` })), progress(j)));
          });
          content.append(h('h3', { class: 'gold', style: 'margin-top:8px', text: 'Receitas' }));
          for (const r of RECIPES) {
            const it = item(r.output);
            const unlocked = recipeUnlocked(c, r);
            const block = craftBlocker(c, r);
            const mats = Object.entries(r.materials).map(([k, n]) => `${lootName(k)} ${c.materials[k] ?? 0}/${n}`).join(', ');
            content.append(
              h('div', { class: 'item row', style: `justify-content:space-between;${unlocked ? '' : 'opacity:0.55'}` },
                h('div', {},
                  h('b', { text: it.name }),
                  h('span', { class: 'muted', text: ` · ${it.description}${it.uses ? ` · ${it.uses} uso(s)/batalha` : ''}` }),
                  h('div', { class: 'muted', style: 'font-size:12px', text: unlocked ? `${mats}${r.consumes ? ` + ${item(r.consumes).name}` : ''} · ${recipeGold(c, r)} ouro · ${r.days} dias` : `🔒 ${researchName(r.requires)}` }),
                ),
                btn('Fabricar', () => (startCraft(c, r.id), Audio.sfx('coin'), render()), { disabled: !!block, title: block ?? '' }),
              ),
            );
          }
        } else if (tab === 'joias') {
          renderJewels(content);
        } else if (tab === 'trabalho') {
          content.append(h('div', { class: 'muted', style: 'margin-bottom:6px', text: 'Heróis na reserva (fora de esquadrões) podem trabalhar: cada um acelera 15% (até 3); Mago e Clérigo contam em dobro na Biblioteca, Guerreiro e Ladino na Forja; no máximo 60%.' }));
          const list = reserve(c);
          if (!list.length) content.append(h('div', { class: 'muted', text: 'Ninguém na reserva.' }));
          for (const ch of list) {
            const cur = b.assigned[ch.id] ?? null;
            const set = (k: WorkKind | null) => () => (assign(c, ch.id, k), render());
            content.append(
              h('div', { class: 'item row', style: 'justify-content:space-between' },
                h('span', {}, h('b', { text: ch.name }), h('span', { class: 'muted', text: ` · ${buildLabel(ch)} · Nv ${ch.level}` })),
                h('span', { class: 'row', style: 'gap:4px' },
                  btn('Livre', set(null), { class: `small ${cur === null ? 'active' : ''}` }),
                  btn('📚 Pesquisa', set('pesquisa'), { class: `small ${cur === 'pesquisa' ? 'active' : ''}` }),
                  btn('⚒ Forja', set('forja'), { class: `small ${cur === 'forja' ? 'active' : ''}` }),
                ),
              ),
            );
          }
        } else {
          for (const f of FACILITIES) {
            const built = b.facilities.includes(f.id);
            const job = b.building.find((j) => j.id === f.id);
            const block = buildBlocker(c, f.id);
            content.append(
              h('div', { class: 'item' },
                h('div', { class: 'row', style: 'justify-content:space-between' },
                  h('span', {}, h('b', { text: f.name }), h('span', { class: 'muted', text: ` · ${f.description}` })),
                  built ? h('span', { class: 'tag gold', text: 'pronta' }) : job ? h('span', { class: 'muted', text: `obra: falta ${days(job.remaining)}` }) : btn(`Construir (${f.cost} ouro, ${f.days} d)`, () => (startBuilding(c, f.id), Audio.sfx('coin'), render()), { disabled: !!block, title: block ?? '' }),
                ),
                job ? progress(job) : null,
              ),
            );
          }
          // Academia de Treino (C19): habilidades de capitão.
          if (b.facilities.includes(ACADEMY)) {
            content.append(h('h3', { class: 'gold', text: `Academia de Treino — habilidades de capitão (${CAPTAINS.learnCost} ouro, até ${CAPTAINS.maxSkills} por herói)` }));
            content.append(h('div', { class: 'muted', text: Object.values(CAPTAIN_SKILLS).map((k) => `${k.label}: ${k.text}`).join(' · ') }));
            for (const ch of Object.values(c.roster)) {
              const sel = h('select', {}) as HTMLSelectElement;
              for (const [id, k] of Object.entries(CAPTAIN_SKILLS)) if (!ch.captainSkills?.includes(id)) sel.append(h('option', { value: id, text: k.label }));
              content.append(
                h('div', { class: 'item row', style: 'justify-content:space-between;gap:6px' },
                  h('span', {}, h('b', { text: ch.name }), h('span', { class: 'muted', text: ` · Nv ${ch.level}${ch.captainSkills?.length ? ` · ${ch.captainSkills.map((id) => CAPTAIN_SKILLS[id as CaptainSkill]?.label ?? id).join(', ')}` : ''}` })),
                  h('span', { class: 'row', style: 'gap:4px' }, sel, btn('Ensinar', () => {
                    if (learnCaptainSkill(c, ch, sel.value as CaptainSkill)) Audio.sfx('coin');
                    render();
                  }, { class: 'small', disabled: !sel.value || !!learnBlock(c, ch, sel.value as CaptainSkill) })),
                ),
              );
            }
          }
        }
        onChange();
      };
      /** Joias no estoque e equipadas: aprender (Santuário), equipar, fortalecer, forjar itens mágicos. */
      const renderJewels = (el: HTMLElement) => {
        const b = c.base!;
        const sanct = b.facilities.includes('santuario');
        el.append(h('div', { class: 'muted', style: 'margin-bottom:6px', text: `${sanct ? 'Santuário pronto.' : '⚠ Construa o Santuário para pesquisar e fortalecer joias.'} Cada espécie é pesquisada uma vez (a joia não é gasta). Joia de habilidade vai no espaço de joia do herói; joia de forja vira item mágico.` }));
        const keys = Object.keys(c.materials).filter((k) => k.startsWith('joia:') && (c.materials[k] ?? 0) > 0);
        el.append(h('h3', { class: 'gold', text: 'No estoque' }));
        if (!keys.length) el.append(h('div', { class: 'muted', text: 'Nenhuma joia da alma. Elas caem raramente das feras.' }));
        for (const key of keys) {
          const sp = key.slice(5);
          const cr = DB.creatures[sp];
          const j = cr?.drops?.jewel;
          if (!cr || !j) continue;
          const known = jewelKnown(c, sp);
          const row = h('div', { class: 'item' });
          row.append(h('div', { class: 'row', style: 'justify-content:space-between' },
            h('b', { text: `💎 ${lootName(key)} ×${c.materials[key]}` }),
            h('span', { class: 'muted', text: `${j.type === 'habilidade' ? 'habilidade' : j.type === 'forja' ? 'forja' : 'tipo a definir'} · ${known ? 'aprendida' : 'não pesquisada'} · NV mín. ${jewelMinLevel(sp)}` }),
          ));
          if (known && j.type === 'habilidade') {
            const sel = h('select', {});
            for (const ch of Object.values(c.roster)) sel.append(h('option', { value: ch.id, text: `${ch.name} (Nv ${ch.level}) · orbes ${ch.jewels?.length ?? 0}/${JEWEL_SLOTS}${(ch.jewels?.length ?? 0) >= JEWEL_SLOTS ? ' — troca o 1º' : ''}` }));
            row.append(h('div', { class: 'row', style: 'gap:6px;margin-top:4px' },
              h('span', { class: 'muted', text: `Dá: ${cr.skills.find((s) => s.id === j.skill)?.name ?? '?'}` }),
              sel,
              btn('Equipar', () => {
                const why = equipBlocker(c, sel.value, sp);
                if (why) return toast(why);
                equipJewel(c, sel.value, sp);
                render();
              }, { class: 'small' }),
            ));
          }
          if (known && j.type === 'forja') {
            const sel = h('select', {});
            const bases = Object.keys(c.inventory).filter((id) => (c.inventory[id] ?? 0) > 0 && ['weapon', 'armor', 'accessory', 'offhand'].includes(DB.items[id]?.slot ?? ''));
            for (const id of bases) sel.append(h('option', { value: id, text: item(id).name }));
            const cost = magicItemCost(c, sp);
            row.append(h('div', { class: 'row', style: 'gap:6px;margin-top:4px;flex-wrap:wrap' },
              h('span', { class: 'muted', text: `Item mágico: peça base + joia + ${Object.entries(cost.materials).map(([k, n]) => `${lootName(k)} ×${n}`).join(', ')} + ${cost.gold} ouro` }),
              bases.length ? sel : h('span', { class: 'muted', text: '(nenhuma arma/armadura/acessório no inventário da base)' }),
              btn('Forjar item mágico', () => {
                const why = magicItemBlocker(c, sp, sel.value);
                if (why) return toast(why);
                const def = startMagicItem(c, sp, sel.value);
                if (def) toast(`Forja: ${def.name} em andamento.`);
                render();
              }, { class: 'small', disabled: !bases.length }),
            ));
          }
          el.append(row);
        }
        const equipped = Object.values(c.roster).filter((ch) => ch.jewels?.length);
        el.append(h('h3', { class: 'gold', style: 'margin-top:8px', text: `Equipadas (${JEWEL_SLOTS} espaços de orbe por herói, fora o acessório)` }));
        if (!equipped.length) el.append(h('div', { class: 'muted', text: 'Ninguém com joia.' }));
        for (const ch of equipped)
          ch.jewels!.forEach((jw, slot) => {
            const cr = DB.creatures[jw.species];
            const skillName = cr?.skills.find((s) => s.id === cr.drops?.jewel.skill)?.name ?? '?';
            const cost = strengthenCost(jw.rank);
            const why = strengthenBlocker(c, ch.id, slot);
            el.append(h('div', { class: 'item row', style: 'justify-content:space-between' },
              h('span', {}, h('b', { text: ch.name }), h('span', { class: 'muted', text: ` · orbe ${slot + 1} · ${lootName(jewelKey(jw.species))} Nv ${jw.rank} · ${skillName}` })),
              h('span', { class: 'row', style: 'gap:4px' },
                btn(cost === null ? 'Nv máximo' : `Fortalecer (${cost} joia${cost > 1 ? 's' : ''})`, () => (strengthenJewel(c, ch.id, slot), render()), { class: 'small', disabled: !!why, title: why ?? '' }),
                btn('Remover', () => (unequipJewel(c, ch.id, slot), render()), { class: 'small' }),
              ),
            ));
          });
      };
      render();
    },
    { wide: true, onClose: onChange },
  );
}
