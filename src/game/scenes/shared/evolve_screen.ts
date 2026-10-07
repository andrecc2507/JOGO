import { btn, clear, h, modal } from '@ui/dom';
import { DB, type ClassId } from '../../data';
import { canPromote, derive, promote, xpToNext, type Character } from '../../rules/character';
import { attrSaveBar, attrTable, confirmPendingAttrs } from './attr_panel';
import { suggestedClass } from '../../rules/recruit';
import { levelAttack } from '../../rules/stats';
import { buildLabel, classSkillIds, lockReason, rankOf, treeOf } from '../../rules/skill_tree';
import { attachZoom, runeWeb, type ZoomView } from './rune_web';
import { skillDetail } from './skill_detail';

/** Habilidade aberta no painel (persiste entre aberturas da tela). */
let selected: string | null = null;
/** Zoom e posição da teia de cada classe (persistem entre redesenhos). */
const views: Record<string, ZoomView | null> = {};

/**
 * Tela cheia "Evoluir": a teia da classe em estilo de runas no centro, os atributos num canto para
 * distribuir pontos e o painel da habilidade escolhida do outro lado.
 */
export function openEvolve(first: Character, onChange: () => void, roster: Character[] = []): void {
  let ch = first;
  const list = roster.length ? roster : [first];
  modal(
    `✦ Evoluir`,
    (body, m) => {
      (m.el.firstElementChild as HTMLElement).classList.add('evolve');
      const left = h('div', { class: 'evolve-side' });
      const center = h('div', { class: 'evolve-center' });
      const right = h('div', { class: 'evolve-side' });
      body.classList.add('evolve-body');
      body.append(left, center, right);
      const render = () => {
        clear(left);
        clear(center);
        clear(right);
        // Troca de personagem sem fechar a janela (◂ ▸ ou a lista).
        if (list.length > 1) {
          const i = Math.max(0, list.indexOf(ch));
          const go = (d: number) => () => {
            confirmPendingAttrs([ch], () => {
              ch = list[(i + d + list.length) % list.length]!;
              render();
            });
          };
          const sel = h('select', { style: 'flex:1;min-width:0' }) as HTMLSelectElement;
          for (const o of list) sel.append(h('option', { value: o.id, text: `${o.name}${o.statPoints || o.skillPoints ? ' •' : ''}` }));
          sel.value = ch.id;
          sel.addEventListener('change', () => confirmPendingAttrs([ch], () => ((ch = list.find((o) => o.id === sel.value) ?? ch), render())));
          left.append(h('div', { class: 'row', style: 'gap:4px;margin-bottom:6px' }, btn('◂', go(-1), { class: 'small' }), sel, btn('▸', go(1), { class: 'small' })));
        }
        renderAttrs(left, ch, render);
        const tree = treeOf(ch.classId);
        if (canPromote(ch) || !tree) {
          renderPromotion(center, ch, render);
        } else {
          if (selected && !classSkillIds(ch.classId).includes(selected)) selected = null;
          const web = runeWeb({
            tree,
            state: (id) => ({ rank: rankOf(ch, id), available: lockReason(ch, id) === null }),
            selected,
            onPick: (id) => ((selected = id), render()),
          });
          const z = attachZoom(web, views[tree.id] ?? null, (v) => (views[tree.id] = { ...v }));
          center.append(
            web,
            h('div', { class: 'evolve-zoom' },
              btn('+', () => z.zoom(1.3), { class: 'small', title: 'Aproximar (roda do mouse)' }),
              btn('−', () => z.zoom(1 / 1.3), { class: 'small', title: 'Afastar' }),
              btn('⟲', () => z.reset(), { class: 'small', title: 'Vista inteira' }),
            ),
            h('div', { class: 'evolve-legend', text: 'Ícone: elemento ou tipo (espada físico · flecha à distância · estrela magia · cruz cura · setas reforço · olho utilidade · losango passiva · seta circular reação) · selo no canto: área, cone ou linha · ⬡ suprema · pontos acima: nível (até 5) · aro pulsando: disponível · roda do mouse: zoom · arrastar: mover' }),
          );
        }
        right.append(
          h('div', { class: 'evolve-card' },
            h('div', { class: 'evolve-title', text: 'Habilidade' }),
            h('div', { class: 'evolve-points', text: `✦ ${ch.skillPoints} ponto(s) de habilidade` }),
            skillDetail(ch, selected, render),
          ),
        );
        onChange();
      };
      render();
    },
    { onClose: () => confirmPendingAttrs([ch], onChange) },
  );
}

/** Canto dos atributos: distribuir pontos (estilo Ragnarok) e ver o efeito na hora. */
function renderAttrs(el: HTMLElement, ch: Character, render: () => void): void {
  const d = derive(ch);
  const cls = DB.classes[ch.classId];
  const card = h('div', { class: 'evolve-card' },
    h('div', { class: 'evolve-title', text: `${cls.name} · Nível ${ch.level}` }),
    h('div', { class: 'gold', style: 'font-size:12px', text: `✦ ${buildLabel(ch)}` }),
    h('div', { class: 'muted', style: 'font-size:11px', text: `XP ${ch.xp}/${xpToNext(ch.level)}` }),
    h('div', { class: 'evolve-points', text: `${ch.statPoints} ponto(s) de atributo` }),
  );
  const table = h('div', {}, attrTable(ch, render, { bonus: d.attrs }), attrSaveBar(ch, render));
  const lv = levelAttack(ch.level);
  const magicWeapon = d.weaponType === 'varinha' || d.weaponType === 'bastao' ? d.weaponAtk : 0;
  card.append(
    table,
    h('table', { class: 'stats', style: 'margin-top:6px;font-size:12px' },
      ...[
        ['Vida', `${d.maxHp}`],
        ['MP', `${d.maxMp}`],
        ['Ataque físico', `${d.weaponAtk + d.physPower + lv}`],
        ['Ataque mágico', `${magicWeapon + d.magicPower + lv}`],
        ['Precisão / esquiva', `${Math.round(d.accuracy)} / ${Math.round(d.evasion)}`],
        ['Ação a cada', `${d.actionInterval.toFixed(1)} s`],
      ].map(([k, v]) => h('tr', {}, h('td', { class: 'muted', text: k! }), h('td', { style: 'text-align:right', text: v! }))),
    ),
  );
  el.append(card);
}

/** Aprendiz no nível 2: escolher a classe antes de abrir a teia. */
function renderPromotion(el: HTMLElement, ch: Character, render: () => void): void {
  const box = h('div', { class: 'evolve-card', style: 'margin:auto;max-width:520px;text-align:center' });
  if (!canPromote(ch)) {
    box.append(h('div', { class: 'evolve-title', text: 'Aprendiz' }), h('div', { class: 'muted', text: 'Escolhe a classe ao chegar no nível 2. Até lá, distribua os atributos ao lado.' }));
    el.append(box);
    return;
  }
  const sug = suggestedClass(ch);
  box.append(h('div', { class: 'evolve-title', text: 'Escolha o caminho' }), h('div', { class: 'muted', style: 'margin-bottom:8px', text: 'A classe abre a teia de habilidades. ★ = sugestão pelos atributos.' }));
  const row = h('div', { class: 'row', style: 'justify-content:center' });
  for (const id of ['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao'] as ClassId[])
    row.append(btn(`${DB.classes[id].name}${id === sug ? ' ★' : ''}`, () => (promote(ch, id), render()), { class: id === sug ? 'primary' : '' }));
  box.append(row);
  el.append(box);
}
