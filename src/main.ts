import { startGame } from '@game/index';
import { mountUi } from '@ui/index';
import { Audio } from '@game/audio/audio';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!canvas || !uiRoot) throw new Error('Elementos #game/#ui-root ausentes no index.html');

const engine = startGame(canvas);
mountUi(uiRoot, engine.services);

// Gancho de depuração para testes automatizados e console do navegador.
(window as unknown as { __jogo: typeof engine & { audio: typeof Audio } }).__jogo = Object.assign(engine, { audio: Audio });
