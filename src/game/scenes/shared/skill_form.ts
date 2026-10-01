import { btn, h } from '@ui/dom';
import { ANIM_STYLES, CREATURE_SKILL_KINDS, ELEMENTS, type AnimStyle, type CreatureSkill, type FxReaction, type SkillShape, type TreeSkill } from '../../data';
import { STATUS_INFO } from '../../battle/types';
import { KIND_LABEL, describeSkill } from '../../bestiary/describe';

/** Nomes das animações de batalha (escolha automática pelo tipo, formato e elemento quando vazio). */
const ANIM_LABEL: Record<AnimStyle, string> = {
  slash: 'Corte',
  claw: 'Garras',
  thrust: 'Estocada',
  spin: 'Giro',
  dash: 'Investida',
  leap: 'Salto',
  arrow: 'Flecha',
  volley: 'Chuva de flechas',
  bolt: 'Raio',
  orb: 'Orbe',
  beam: 'Feixe',
  cone: 'Cone',
  nova: 'Explosão',
  meteor: 'Meteoro',
  heal: 'Cura',
  buff: 'Bênção',
  smoke: 'Fumaça',
  blink: 'Teleporte',
  summon: 'Invocação',
  trap: 'Armadilha',
  charge: 'Concentração',
  shout: 'Grito',
};

/**
 * Formulário de uma habilidade (criaturas e árvores de classe usam o mesmo).
 * `changed` avisa que algo mudou; `rerender` redesenha a ficha inteira (mudanças de tipo/formato).
 */

export const ELEMENT_LABEL: Record<string, string> = {
  neutro: 'Neutro',
  fogo: 'Fogo',
  agua: 'Água',
  gelo: 'Gelo',
  eletricidade: 'Eletricidade',
  vento: 'Vento',
  terra: 'Terra',
  veneno: 'Veneno',
  luz: 'Luz',
  sombra: 'Sombra',
};
export const STATUS_OPTIONS: [string, string][] = [['', 'nenhum'], ...Object.entries(STATUS_INFO).map(([k, v]) => [k, v.name] as [string, string])];
const SHAPE_LABEL: Record<SkillShape, string> = { single: 'Alvo único', radius: 'Área (raio)', line: 'Linha', cone: 'Cone' };
const TARGET_LABEL: [string, string][] = [['', 'automático'], ['enemy', 'inimigo'], ['ally', 'aliado'], ['tile', 'tile'], ['self', 'si mesma']];
const REACT_ON: [FxReaction['on'], string][] = [['physical', 'golpe físico'], ['melee', 'corpo a corpo'], ['ranged', 'à distância'], ['magic', 'magia'], ['any', 'qualquer golpe'], ['crit', 'crítico'], ['heavy', 'golpe pesado'], ['summon', 'invocação']];
const REACT_DO: [FxReaction['do'], string][] = [
  ['dodge', 'esquiva'],
  ['negate', 'anula'],
  ['mitigate', 'reduz o dano'],
  ['reflect', 'reflete'],
  ['counter', 'contra-ataca'],
  ['riposte', 'esquiva e contra-ataca'],
  ['status', 'pune o atacante'],
  ['retreat', 'esquiva e recua'],
  ['swap', 'troca inimigos'],
  ['split', 'divide-se'],
];

export interface FormHooks {
  changed: () => void;
  rerender: () => void;
}

export function field(hooks: FormHooks) {
  const text = (label: string, value: string, set: (v: string) => void, area = false) => {
    const input = area ? h('textarea', {}) : h('input', { value });
    if (area) (input as HTMLTextAreaElement).value = value;
    input.style.width = '100%';
    if (area) input.setAttribute('rows', '2');
    input.addEventListener('input', () => {
      set((input as HTMLInputElement).value);
      hooks.changed();
    });
    return h('label', { class: 'col' }, h('span', { class: 'muted', text: label }), input);
  };
  const num = (label: string, value: number, set: (v: number) => void, opts: { min?: number; max?: number; step?: number; suffix?: string } = {}) => {
    const input = h('input', { type: 'number', value: String(value) });
    input.style.width = '72px';
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    input.step = String(opts.step ?? 1);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      set(v);
      hooks.changed();
    });
    return h('label', { class: 'row', style: 'gap:4px' }, h('span', { style: 'min-width:90px', text: label }), input, opts.suffix ? h('span', { class: 'muted', text: opts.suffix }) : null);
  };
  const select = (label: string, value: string, options: [string, string][], set: (v: string) => void) => {
    const s = h('select', {});
    for (const [v, t] of options) s.append(h('option', { value: v, text: t }));
    s.value = value;
    s.addEventListener('change', () => {
      set(s.value);
      hooks.changed();
      hooks.rerender();
    });
    return h('label', { class: 'row', style: 'gap:4px' }, h('span', { style: 'min-width:90px', text: label }), s);
  };
  const check = (label: string, value: boolean, set: (v: boolean) => void) => {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = value;
    cb.addEventListener('change', () => {
      set(cb.checked);
      hooks.changed();
    });
    return h('label', { class: 'row', style: 'gap:4px' }, cb, h('span', { text: label }));
  };
  return { text, num, select, check };
}

function fxBox(sk: CreatureSkill, hooks: FormHooks): HTMLElement {
  const area = h('textarea', {});
  area.value = sk.fx ? JSON.stringify(sk.fx, null, 1) : '';
  area.setAttribute('rows', String(Math.min(8, Math.max(2, area.value.split('\n').length))));
  area.setAttribute('spellcheck', 'false');
  area.style.cssText = 'width:100%;font-family:monospace;font-size:11px';
  const err = h('span', { class: 'muted', style: 'font-size:11px' });
  area.addEventListener('change', () => {
    try {
      sk.fx = area.value.trim() ? JSON.parse(area.value) : undefined;
      err.textContent = '';
      hooks.changed();
      hooks.rerender();
    } catch {
      err.textContent = '⚠ JSON inválido';
    }
  });
  return h('label', { class: 'col' }, h('span', { class: 'muted', text: 'Efeitos avançados (JSON — veja docs/design/bestiario.md)' }), area, err);
}

function isTreeSkill(s: CreatureSkill): s is TreeSkill {
  return 'mp' in s;
}

/** Ficha editável de uma habilidade. `remove` aparece como botão no fim. */
export function skillCard(s: CreatureSkill | TreeSkill, hooks: FormHooks, remove?: () => void): HTMLElement {
  const { text, num, select, check } = field(hooks);
  const tree = isTreeSkill(s);
  return h(
    'div',
    { class: 'item col', style: `cursor:default${s.signature || (tree && s.ultimate) ? ';border-color:#ffb300' : ''}` },
    h('div', { class: 'gold', style: 'font-size:11px', text: describeSkill(s) }),
    text('Nome', s.name, (v) => (s.name = v)),
    text('Descrição', s.description, (v) => (s.description = v), true),
    tree
      ? h('div', { class: 'row', style: 'gap:10px' },
          num('Custo', s.mp, (v) => (s.mp = Math.max(0, Math.round(v))), { min: 0, suffix: 'MP' }),
          num('NV mínimo', s.levelReq ?? 1, (v) => (s.levelReq = Math.max(1, Math.min(99, Math.round(v)))), { min: 1, max: 99 }),
          check('Suprema (ultimate)', !!s.ultimate, (v) => (s.ultimate = v || undefined)),
        )
      : null,
    h('div', { class: 'row', style: 'gap:10px' },
      select('Tipo', s.kind, CREATURE_SKILL_KINDS.map((k) => [k, KIND_LABEL[k]]), (v) => {
        s.kind = v as CreatureSkill['kind'];
        if (s.kind === 'reaction' && !s.react) s.react = { on: 'physical', do: 'dodge' };
      }),
      select('Formato', s.shape ?? 'single', Object.entries(SHAPE_LABEL), (v) => (s.shape = v === 'single' ? undefined : (v as SkillShape))),
      select('Alvo', s.target ?? '', TARGET_LABEL, (v) => (s.target = (v || undefined) as CreatureSkill['target'])),
    ),
    h('div', { class: 'row', style: 'gap:10px' },
      num('Alcance', s.range, (v) => (s.range = Math.max(0, Math.round(v))), { min: 0, suffix: 'm' }),
      num('Poder', s.power, (v) => (s.power = Math.max(0, Math.round(v))), { min: 0 }),
      num('Recarga', s.cooldown, (v) => (s.cooldown = Math.max(0, Math.round(v))), { min: 0, suffix: 'turnos' }),
      s.shape === 'radius' || s.radius ? num('Raio', s.radius ?? 1, (v) => (s.radius = Math.max(0, Math.round(v)) || undefined), { min: 0 }) : null,
    ),
    h('div', { class: 'row', style: 'gap:10px' },
      select('Elemento', s.element ?? '', [['', 'nenhum'], ...ELEMENTS.map((e) => [e, ELEMENT_LABEL[e]!] as [string, string])], (v) => (s.element = (v || undefined) as CreatureSkill['element'])),
      select('Status no alvo', s.status?.id ?? '', STATUS_OPTIONS, (v) => (s.status = v ? { id: v, turns: s.status?.turns ?? 2 } : undefined)),
      s.status ? num('Duração', s.status.turns, (v) => (s.status!.turns = Math.max(1, Math.round(v))), { min: 1, suffix: 'turnos' }) : null,
    ),
    s.kind !== 'passive'
      ? h('div', { class: 'row', style: 'gap:10px' },
          select('Animação', s.anim ?? '', [['', 'automática'], ...ANIM_STYLES.map((a) => [a, ANIM_LABEL[a]] as [string, string])], (v) => (s.anim = (v || undefined) as AnimStyle | undefined)),
        )
      : null,
    s.kind === 'reaction' && s.react
      ? h('div', { class: 'row', style: 'gap:10px' },
          select('Gatilho', s.react.on, REACT_ON, (v) => (s.react!.on = v as FxReaction['on'])),
          select('Resposta', s.react.do, REACT_DO, (v) => (s.react!.do = v as FxReaction['do'])),
          num('Chance', s.react.chance ?? 100, (v) => (s.react!.chance = Math.max(1, Math.min(100, Math.round(v)))), { min: 1, max: 100, suffix: '%' }),
        )
      : null,
    fxBox(s, hooks),
    remove ? btn('Remover habilidade', remove, { class: 'small danger' }) : null,
  );
}
