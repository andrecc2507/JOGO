import { btn, h, uiRoot } from '@ui/dom';
import { Audio } from './audio';

/** Libera o áudio no primeiro gesto, toca clique nos botões e monta o controle de volume (🔊 / tecla M). */
export function mountAudioUi(): void {
  const unlock = () => Audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement)?.closest?.('.btn')) Audio.sfx('click');
  }, true);
  let panel: HTMLElement | null = null;
  const toggle = btn(Audio.muted ? '🔇' : '🔊', () => {
    if (panel) {
      panel.remove();
      panel = null;
      return;
    }
    const slider = (label: string, value: number, set: (v: number) => void) => {
      const input = h('input', { type: 'range' });
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(value);
      input.addEventListener('input', () => set(Number(input.value)));
      return h('div', { class: 'row' }, h('span', { style: 'min-width:60px', text: label }), input);
    };
    panel = h(
      'div',
      { class: 'dev-panel', style: 'bottom:44px;right:60px;width:230px;background:rgba(20,18,24,0.95);border-color:#5a4a32' },
      h('b', { class: 'gold', text: 'Áudio' }),
      slider('Música', Audio.musicVolume, (v) => Audio.setMusicVolume(v)),
      slider('Efeitos', Audio.sfxVolume, (v) => Audio.setSfxVolume(v)),
      btn(Audio.muted ? 'Ativar som' : 'Silenciar (M)', () => {
        const m = Audio.toggleMute();
        toggle.textContent = m ? '🔇' : '🔊';
        panel?.remove();
        panel = null;
      }, { class: 'small' }),
    );
    uiRoot().append(panel);
  }, { class: 'dev-toggle', title: 'Áudio (M)' });
  toggle.style.right = '62px';
  uiRoot().append(toggle);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) toggle.textContent = Audio.toggleMute() ? '🔇' : '🔊';
  });
}
