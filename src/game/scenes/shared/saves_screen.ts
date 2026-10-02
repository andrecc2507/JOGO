import type { SaveService } from '@core';
import { t } from '../../i18n/i18n';
import { btn, h, modal, toast } from '@ui/dom';
import { AUTO_SLOT, SAVE_SLOTS, saveGame, slotInfo, store } from '../../state/store';

const SLOT_NAME: Record<string, string> = { campanha: 'Espaço 1', campanha_2: 'Espaço 2', campanha_3: 'Espaço 3', auto: 'Automático' };

function when(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}`;
}

/** Carregar: os três espaços manuais e o automático. */
export function openLoad(save: SaveService, onLoad: (slot: string) => void): void {
  modal(t('📂 Carregar jogo'), (body, m) => {
    for (const slot of [...SAVE_SLOTS, AUTO_SLOT]) {
      const info = slotInfo(save, slot);
      body.append(
        h('div', { class: 'item row', style: 'justify-content:space-between' },
          h('div', {}, h('b', { text: `${t(SLOT_NAME[slot]!)}${info?.ironman ? ' ⛓' : ''}` }), h('div', { class: 'muted', text: info ? `${info.label} · ${when(info.savedAt)}` : t('Vazio') })),
          h('div', { class: 'row' },
            btn(t('Carregar'), () => (m.close(), onLoad(slot)), { class: 'primary small', disabled: !info }),
            btn(t('Apagar'), () => {
              if (!info || !confirm(`Apagar ${SLOT_NAME[slot]}? Não dá para desfazer.`)) return;
              save.delete(slot);
              m.close();
              openLoad(save, onLoad);
            }, { class: 'small danger', disabled: !info }),
          ),
        ),
      );
    }
  });
}

/** Salvar em um espaço escolhido (fora do Modo Ferro). */
export function openSaveAs(save: SaveService): void {
  if (store.campaign?.ironman) {
    toast('Modo Ferro: o jogo é salvo automaticamente, num espaço só.');
    return;
  }
  modal(t('💾 Salvar jogo'), (body, m) => {
    for (const slot of SAVE_SLOTS) {
      const info = slotInfo(save, slot);
      body.append(
        h('div', { class: 'item row', style: 'justify-content:space-between' },
          h('div', {}, h('b', { text: `${SLOT_NAME[slot]}${slot === store.slot ? ' (atual)' : ''}` }), h('div', { class: 'muted', text: info ? `${info.label} · ${when(info.savedAt)}` : 'Vazio' })),
          btn(info ? t('Sobrescrever') : t('Salvar aqui'), () => {
            if (info?.ironman) return toast('Esse espaço é de uma campanha em Modo Ferro.');
            if (info && slot !== store.slot && !confirm(`Sobrescrever ${SLOT_NAME[slot]}?`)) return;
            saveGame(save, slot);
            m.close();
            toast(`Salvo em ${SLOT_NAME[slot]}.`);
          }, { class: 'primary small' }),
        ),
      );
    }
  });
}

export { SLOT_NAME };
