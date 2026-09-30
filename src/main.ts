import { startGame } from '@game/index';
import { mountUi } from '@ui/index';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!canvas || !uiRoot) throw new Error('Elementos #game/#ui-root ausentes no index.html');

const engine = startGame(canvas);
mountUi(uiRoot, engine.services);
