import { btn, clear, h, modal, type Modal } from '@ui/dom';
import type { Campaign } from '../../world/campaign';
import { setFlag, speakerOf, visibleLines, type StoryChoice, type StoryLine } from '../../world/story';

export interface DialogueAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

export interface DialogueOptions {
  title: string;
  subtitle?: string;
  lines: StoryLine[];
  choice?: StoryChoice;
  /** Botões no fim (depois das falas e da escolha). Sem eles: "Fechar". */
  actions?: DialogueAction[];
  /** Conteúdo extra mostrado junto dos botões finais (recompensas, objetivo). */
  footer?: (el: HTMLElement) => void;
  onClose?: () => void;
}

/**
 * Cena de diálogo da história: uma fala por vez (retrato, nome, texto), com "Continuar" e "Pular".
 * No fim, a escolha (marca a campanha) e os botões de ação.
 */
export function playDialogue(c: Campaign, o: DialogueOptions): Modal {
  const commander = c.roster[c.commanderId]?.name ?? 'Comandante';
  return modal(
    o.title,
    (body, m) => {
      (m.el.firstElementChild as HTMLElement).classList.add('story-modal');
      if (o.subtitle) body.append(h('div', { class: 'story-sub', text: o.subtitle }));
      const log = h('div', { class: 'story-log' });
      const controls = h('div', { class: 'story-controls' });
      body.append(log, controls);
      let queue = visibleLines(c, o.lines);
      let i = 0;
      const lineEl = (l: StoryLine) => {
        const sp = speakerOf(l.s, commander);
        if (l.s === 'narr') return h('div', { class: 'story-line narr', text: l.t });
        return h('div', { class: 'story-line' },
          h('div', { class: 'story-portrait', style: `border-color:${sp.color};color:${sp.color}`, text: sp.icon }),
          h('div', { class: 'story-text' }, h('div', { class: 'story-name', style: `color:${sp.color}`, text: sp.name }), h('div', { text: l.t })),
        );
      };
      const push = (l: StoryLine) => {
        for (const el of log.querySelectorAll('.story-line.current')) el.classList.remove('current');
        const el = lineEl(l);
        el.classList.add('current');
        log.append(el);
        log.scrollTop = log.scrollHeight;
      };
      let choiceDone = !o.choice;
      const finish = () => {
        clear(controls);
        if (!choiceDone && o.choice) {
          const ch = o.choice;
          controls.append(h('div', { class: 'story-prompt', text: ch.prompt }));
          const opts = h('div', { class: 'story-options' });
          for (const opt of ch.options)
            opts.append(
              btn(opt.label, () => {
                setFlag(c, opt.flag);
                choiceDone = true;
                push({ s: 'cmd', t: opt.label.replace(/^"|"$/g, '') });
                queue = [...queue, ...visibleLines(c, opt.lines ?? [])];
                next();
              }, { class: 'story-option' }),
            );
          controls.append(opts);
          return;
        }
        if (o.footer) {
          const f = h('div', { class: 'story-footer' });
          o.footer(f);
          controls.append(f);
        }
        const row = h('div', { class: 'row', style: 'justify-content:flex-end;gap:8px' });
        const acts = o.actions?.length ? o.actions : [{ label: 'Fechar', primary: true, run: () => undefined }];
        for (const a of acts)
          row.append(
            btn(a.label, () => {
              m.close();
              a.run();
            }, { class: a.primary ? 'primary' : '' }),
          );
        controls.append(row);
      };
      const next = () => {
        if (i < queue.length) {
          push(queue[i++]!);
          clear(controls);
          controls.append(
            h('div', { class: 'row', style: 'justify-content:space-between' },
              btn('Pular ⏭', () => {
                while (i < queue.length) push(queue[i++]!);
                finish();
              }, { class: 'ghost small' }),
              btn('Continuar ▸', next, { class: 'primary' }),
            ),
          );
          return;
        }
        finish();
      };
      log.addEventListener('click', () => i < queue.length && next());
      next();
    },
    { closable: false, wide: true, onClose: o.onClose },
  );
}
