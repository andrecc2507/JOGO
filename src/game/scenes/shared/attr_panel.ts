import { btn, h, modal } from '@ui/dom';
import { ATTRS, ATTR_LABEL, type Attributes } from '../../data';
import { commitAttrs, draftAllocate, draftDeallocate, pendingAttr, revertAttrs, statCost, type Character } from '../../rules/character';

/**
 * Atributos estilo Ragnarok: + gasta um ponto, − desfaz um ponto ainda não salvo, e "Salvar" deixa
 * tudo definitivo (o que já foi salvo nunca mais se mexe). `bonus` mostra o extra de equipamento.
 */
export function attrTable(ch: Character, rerender: () => void, opts: { bonus?: Attributes; star?: Partial<Record<string, boolean>> } = {}): HTMLElement {
  const table = h('table', { class: 'stats attr-draft' });
  for (const a of ATTRS) {
    const cost = statCost(ch.attrs[a]);
    const pend = pendingAttr(ch, a);
    const bonus = opts.bonus ? opts.bonus[a] - ch.attrs[a] : 0;
    table.append(
      h('tr', {},
        h('td', { text: `${ATTR_LABEL[a]}${opts.star?.[a] ? ' ★' : ''}` }),
        h('td', { style: 'text-align:right;white-space:nowrap' },
          h('b', { text: String(ch.attrs[a] - pend) }),
          pend ? h('span', { style: 'color:#81c784', text: ` +${pend}` }) : '',
          bonus ? h('span', { class: 'muted', text: ` (${bonus > 0 ? '+' : ''}${bonus})` }) : '',
        ),
        h('td', { class: 'muted', style: 'font-size:11px;white-space:nowrap', text: `custo ${cost}` }),
        h('td', { style: 'white-space:nowrap' },
          btn('−', () => (draftDeallocate(ch, a), rerender()), { class: 'small', disabled: pend <= 0, title: 'Desfaz um ponto ainda não salvo' }),
          btn('+', () => (draftAllocate(ch, a), rerender()), { class: 'small primary', disabled: ch.statPoints < cost }),
        ),
      ),
    );
  }
  return table;
}

/** Barra "Salvar / Descartar" do rascunho (some quando não há nada pendente). */
export function attrSaveBar(ch: Character, rerender: () => void): HTMLElement {
  const pend = pendingAttr(ch);
  if (!pend) return h('div', { class: 'muted', style: 'font-size:11px', text: `${ch.statPoints} ponto(s) livres. Pontos salvos não voltam.` });
  return h('div', { class: 'row', style: 'gap:6px;align-items:center;margin-top:4px' },
    h('span', { class: 'gold', text: `${pend} ponto(s) no rascunho` }),
    btn('✔ Salvar', () => (commitAttrs(ch), rerender()), { class: 'small primary', title: 'Depois de salvar, esses pontos ficam para sempre' }),
    btn('Descartar', () => (revertAttrs(ch), rerender()), { class: 'small' }),
  );
}

/** Ao fechar uma tela com rascunho pendente: pergunta se salva. */
export function confirmPendingAttrs(chars: Character[], after: () => void = () => undefined): void {
  const pending = chars.filter((c) => pendingAttr(c) > 0);
  if (!pending.length) return after();
  modal('Pontos não salvos', (body, m) => {
    body.append(
      h('p', { text: `${pending.map((c) => c.name).join(', ')}: há atributos distribuídos que ainda não foram salvos.` }),
      h('div', { class: 'row' },
        btn('✔ Salvar', () => {
          for (const c of pending) commitAttrs(c);
          m.close();
        }, { class: 'primary' }),
        btn('Descartar', () => {
          for (const c of pending) revertAttrs(c);
          m.close();
        }),
      ),
    );
  }, { closable: false, onClose: after });
}
