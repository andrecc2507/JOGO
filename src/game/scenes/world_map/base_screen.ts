import { btn, clear, h, modal, toast } from '@ui/dom';
import { DB, item } from '../../data';
import { Audio } from '../../audio/audio';
import { lootName } from '../../rules/drops';
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
export function openBase(c: Campaign, onChange: () => void): void {
  if (!c.base) return;
  let tab: 'instalacoes' | 'pesquisa' | 'forja' | 'trabalho' = 'pesquisa';
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
        } else if (tab === 'trabalho') {
          content.append(h('div', { class: 'muted', style: 'margin-bottom:6px', text: 'Heróis na reserva (fora de esquadrões) podem trabalhar: cada um acelera 15% (até 3); Mago e Clérigo contam em dobro na Biblioteca, Guerreiro e Ladino na Forja; no máximo 60%.' }));
          const list = reserve(c);
          if (!list.length) content.append(h('div', { class: 'muted', text: 'Ninguém na reserva.' }));
          for (const ch of list) {
            const cur = b.assigned[ch.id] ?? null;
            const set = (k: WorkKind | null) => () => (assign(c, ch.id, k), render());
            content.append(
              h('div', { class: 'item row', style: 'justify-content:space-between' },
                h('span', {}, h('b', { text: ch.name }), h('span', { class: 'muted', text: ` · ${DB.classes[ch.classId].name} Nv ${ch.level}` })),
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
          content.append(h('div', { class: 'muted', style: 'margin-top:6px', text: 'Academia de Treino (habilidades do comandante) chega depois.' }));
        }
        onChange();
      };
      render();
    },
    { wide: true, onClose: onChange },
  );
}
