import { btn, clear, h, modal } from '@ui/dom';
import { t } from '../../i18n/i18n';
import { Audio } from '../../audio/audio';
import { INPUT_BINDINGS } from '../../config/input.config';
import {
  ACTION_LABEL,
  BATTLE_SPEEDS,
  COLOR_MODE_LABEL,
  TEXT_SPEED,
  defaultSettings,
  effectiveBindings,
  keyLabel,
  saveSettings,
  settings,
  type ColorMode,
  type TextSpeed,
} from '../../state/settings';

type Tab = 'jogo' | 'audio' | 'acessibilidade' | 'controles';

/** Menu de opções: jogo, áudio, acessibilidade e controles (teclas e controle). */
export function openOptions(onChange?: () => void): void {
  let tab: Tab = 'jogo';
  let capturing: string | null = null;
  modal(
    t('⚙ Opções'),
    (body) => {
      const tabs = h('div', { class: 'tabs' });
      const content = h('div', { class: 'options' });
      body.append(tabs, content);
      const row = (label: string, ...ctrl: (Node | string)[]) => h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: t(label) }), h('div', { class: 'opt-ctrl' }, ...ctrl));
      const choice = <T extends string | number>(values: T[], current: T, label: (v: T) => string, set: (v: T) => void) =>
        h('div', { class: 'row', style: 'gap:4px' }, ...values.map((v) => btn(label(v), () => (set(v), saveSettings(), render()), { class: `small ${v === current ? 'active' : ''}` })));
      const slider = (value: number, min: number, max: number, step: number, set: (v: number) => void, fmt: (v: number) => string) => {
        const input = h('input', { type: 'range', value: String(value) });
        Object.assign(input, { min: String(min), max: String(max), step: String(step) });
        const out = h('span', { class: 'muted', text: fmt(value) });
        input.addEventListener('input', () => {
          set(Number(input.value));
          out.textContent = fmt(Number(input.value));
        });
        return h('div', { class: 'row', style: 'gap:8px' }, input, out);
      };
      const render = () => {
        clear(tabs);
        clear(content);
        for (const [id, label] of [['jogo', 'Jogo'], ['audio', 'Áudio'], ['acessibilidade', 'Acessibilidade'], ['controles', 'Controles']] as [Tab, string][])
          tabs.append(btn(t(label), () => ((tab = id), render()), { class: tab === id ? 'active' : '' }));
        if (tab === 'jogo') {
          content.append(
            row('Velocidade da batalha', choice(BATTLE_SPEEDS, settings.battleSpeed, (v) => `${v}×`, (v) => (settings.battleSpeed = v))),
            row('Pular animações', choice([false, true].map(String), String(settings.skipAnims), (v) => (v === 'true' ? t('Sim') : t('Não')), (v) => (settings.skipAnims = v === 'true'))),
            row('Velocidade do texto', choice(Object.keys(TEXT_SPEED) as TextSpeed[], settings.textSpeed, (v) => t(({ lento: 'Lenta', normal: 'Normal', rapido: 'Rápida', instantaneo: 'Instantânea' })[v]), (v) => (settings.textSpeed = v))),
            row('Dicas no contexto', choice([true, false].map(String), String(settings.hints), (v) => (v === 'true' ? t('Ligadas') : t('Desligadas')), (v) => (settings.hints = v === 'true'))),
            row('Dicas já vistas', btn(t('Mostrar de novo'), () => ((settings.seenHints = []), saveSettings(), render()), { class: 'small' })),
            row('Idioma', choice(['pt', 'en'] as const, settings.language, (v) => (v === 'pt' ? 'Português' : 'English (interface)'), (v) => (settings.language = v))),
          );
        } else if (tab === 'audio') {
          content.append(
            row('Música', slider(Audio.musicVolume, 0, 1, 0.05, (v) => Audio.setMusicVolume(v), (v) => `${Math.round(v * 100)}%`)),
            row('Efeitos', slider(Audio.sfxVolume, 0, 1, 0.05, (v) => Audio.setSfxVolume(v), (v) => `${Math.round(v * 100)}%`)),
            row('Som', btn(Audio.muted ? '🔇 Mudo' : '🔊 Ligado', () => (Audio.toggleMute(), render()), { class: 'small' })),
          );
        } else if (tab === 'acessibilidade') {
          content.append(
            row('Tamanho da fonte', slider(settings.fontScale, 0.85, 1.4, 0.05, (v) => ((settings.fontScale = v), saveSettings()), (v) => `${Math.round(v * 100)}%`)),
            row('Modo de cor', choice(Object.keys(COLOR_MODE_LABEL) as ColorMode[], settings.colorMode, (v) => COLOR_MODE_LABEL[v], (v) => (settings.colorMode = v))),
            h('div', { class: 'muted', style: 'font-size:12px;margin-top:6px', text: 'O modo de cor troca as cores de aliados e inimigos (barras, marcadores e painéis) por pares que continuam distintos para cada tipo de daltonismo.' }),
          );
        } else {
          const binds = effectiveBindings();
          const list = h('div', { class: 'col' });
          for (const action of Object.keys(INPUT_BINDINGS).filter((a) => a !== 'debug_toggle')) {
            const keys = (binds[action] ?? []).filter((k) => !k.startsWith('Pad'));
            const pads = (binds[action] ?? []).filter((k) => k.startsWith('Pad'));
            list.append(
              row(
                ACTION_LABEL[action] ?? action,
                h('span', { class: 'kbd', text: capturing === action ? 'pressione uma tecla…' : keys.map(keyLabel).join(' / ') || '—' }),
                pads.length ? h('span', { class: 'muted', style: 'font-size:11px', text: `🎮 ${pads.map((p) => p.slice(3)).join(' / ')}` }) : '',
                btn(t('Alterar'), () => {
                  capturing = action;
                  render();
                  const onKey = (e: KeyboardEvent) => {
                    e.preventDefault();
                    window.removeEventListener('keydown', onKey, true);
                    if (e.code !== 'Escape') settings.keys[action] = [e.code, ...pads];
                    capturing = null;
                    saveSettings();
                    render();
                  };
                  window.addEventListener('keydown', onKey, true);
                }, { class: 'small' }),
              ),
            );
          }
          content.append(
            list,
            h('div', { class: 'row', style: 'margin-top:8px' }, btn(t('Restaurar teclas padrão'), () => ((settings.keys = defaultSettings().keys), saveSettings(), render()), { class: 'small' })),
            h('div', { class: 'muted', style: 'font-size:12px;margin-top:8px', text: 'Controle (Steam Deck, Xbox, PlayStation): analógico esquerdo move o cursor e A clica; B cancela e fecha janelas; analógico direito e direcional movem a câmera; LB/RB giram; Y volta o turno; Start pausa o mapa.' }),
          );
        }
        onChange?.();
      };
      render();
    },
    { wide: true },
  );
}
