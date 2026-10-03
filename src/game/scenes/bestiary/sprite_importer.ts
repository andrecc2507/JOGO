import { btn, clear, h, modal, toast } from '@ui/dom';
import { DB, type CreatureDef } from '../../data';
import { POSES, mergeArtSlot } from '../../render/sprite_anims';
import { saveLocalSprite } from '../../render/sprite_local';
import { DEFAULT_IMPORT, IMPORT_LIMITS, SHEET_ORDER, colorCount, idFromFileName, importSprite, splitPoseSheet, type ImportOptions, type Rgba } from '../../render/sprite_import';

/**
 * Importador de sprites (ferramenta de desenvolvimento, no Bestiário): arraste a imagem gerada,
 * ajuste altura, cores, fundo e espelho vendo o resultado, e grave.
 * - No `npm run dev`: "Salvar no projeto" grava o PNG em public/ e a entrada em sprite_art.json.
 * - Em qualquer lugar: "Usar neste navegador" (localStorage) e "Baixar PNG".
 * Várias imagens de uma vez viram os quadros de uma animação (na ordem do nome do arquivo).
 * O modo lote converte a imagem parada de várias criaturas pelo nome do arquivo (= id da criatura).
 */

const POSE_LABEL: Record<string, string> = { idle: 'Parado', move: 'Andando', jump: 'Pulando', hurt: 'Sofrendo dano', fallen: 'Caído', dead: 'Morto', attack: 'Golpe', cast: 'Magia' };
const OPTS_KEY = 'jogo:importador_sprites';

function loadOpts(): ImportOptions {
  try {
    return { ...DEFAULT_IMPORT, ...(JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}') as Partial<ImportOptions>) };
  } catch {
    return { ...DEFAULT_IMPORT };
  }
}

function saveOpts(o: ImportOptions): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(o));
  } catch {
    // tanto faz
  }
}

/** Lê um arquivo de imagem como RGBA. */
async function readImage(file: File): Promise<Rgba> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}

/** Atributos que o `h` não conhece (min, max, accept, multiple). */
function attrs<T extends HTMLElement>(el: T, a: Record<string, string>): T {
  for (const [k, v] of Object.entries(a)) el.setAttribute(k, v);
  return el;
}

function toCanvas(img: Rgba): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

function pngDataUrl(img: Rgba): string {
  return toCanvas(img).toDataURL('image/png');
}

/** O servidor de desenvolvimento aceita gravar? (só no `npm run dev`). */
let devServer: boolean | null = null;
async function canSaveToProject(): Promise<boolean> {
  if (devServer !== null) return devServer;
  try {
    const r = await fetch('/__dev/sprite');
    devServer = r.ok && ((await r.json()) as { ok?: boolean }).ok === true;
  } catch {
    devServer = false;
  }
  return devServer;
}

async function saveToProject(id: string, slot: string, img: Rgba, frames: number, fps?: number): Promise<string> {
  const png = pngDataUrl(img).split(',')[1]!;
  const r = await fetch('/__dev/sprite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, slot, frames, fps, png }) });
  const body = (await r.json()) as { ok?: boolean; file?: string; error?: string };
  if (!r.ok || !body.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body.file ?? '';
}

function download(img: Rgba, name: string): void {
  const a = document.createElement('a');
  a.href = pngDataUrl(img);
  a.download = name;
  a.click();
}

/** Prévia ampliada sobre xadrez, animando os quadros. */
function previewBox(): { el: HTMLElement; show: (frames: Rgba[], fps: number) => void; stop: () => void } {
  const canvas = h('canvas', { class: 'spr-preview' }) as HTMLCanvasElement;
  let timer = 0;
  const stop = () => window.clearInterval(timer);
  const show = (frames: Rgba[], fps: number) => {
    stop();
    const f0 = frames[0]!;
    const zoom = Math.max(2, Math.floor(Math.min(300 / f0.height, 260 / f0.width)));
    canvas.width = f0.width * zoom;
    canvas.height = f0.height * zoom;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const tiles = frames.map(toCanvas);
    let n = 0;
    const draw = () => {
      for (let y = 0; y < canvas.height; y += zoom * 2)
        for (let x = 0; x < canvas.width; x += zoom * 2) {
          ctx.fillStyle = ((x + y) / (zoom * 2)) % 2 ? '#2a2f2a' : '#343a34';
          ctx.fillRect(x, y, zoom * 2, zoom * 2);
        }
      ctx.drawImage(tiles[n % tiles.length]!, 0, 0, canvas.width, canvas.height);
      n++;
    };
    draw();
    if (tiles.length > 1) timer = window.setInterval(draw, 1000 / Math.max(1, fps));
  };
  return { el: canvas, show, stop };
}

export function openSpriteImporter(c: CreatureDef, onSaved: () => void): void {
  const opts = loadOpts();
  /** Imagens carregadas (como vieram). */
  let raw: Rgba[] = [];
  let names: string[] = [];
  /** Imagens que entram na conversão: as carregadas, ou as figuras recortadas da folha de poses. */
  let sources: Rgba[] = [];
  let result: ReturnType<typeof importSprite> | null = null;
  let slot = 'base';
  let fps = 8;
  /** Folha de poses: a pose de cada figura (na ordem de leitura); '' = ignorar. */
  let sheetMap: string[] = [];
  const prev = previewBox();
  const original = h('div', { class: 'spr-originals' });
  const info = h('div', { class: 'muted', style: 'font-size:12px' });
  const mapBox = h('div', { class: 'spr-map' });
  const actions = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:8px' });
  const batchLog = h('div', { class: 'muted', style: 'font-size:12px;max-height:120px;overflow:auto' });

  const recompute = () => {
    saveOpts(opts);
    clear(info);
    clear(mapBox);
    sources = slot === 'sheet' && raw.length === 1 ? splitPoseSheet(raw[0]!, opts.tolerance) : raw;
    if (!sources.length) {
      info.append(raw.length ? '⚠ Nenhuma figura encontrada na folha (ajuste a tolerância do fundo).' : 'Nenhuma imagem ainda.');
      result = null;
      renderActions();
      return;
    }
    try {
      result = importSprite(sources, opts);
      prev.show(result.frames, slot === 'sheet' ? 1.5 : fps);
      const f = result.frames[0]!;
      info.append(`${f.width}×${f.height} px por quadro · ${result.frames.length} ${slot === 'sheet' ? 'pose(s)' : 'quadro(s)'} · ${colorCount(result.sheet)} cores · cada pixel do jogo = ${result.cell.toFixed(1)} px da imagem`);
      if (slot === 'sheet') renderMap();
    } catch (e) {
      result = null;
      info.append(`⚠ ${(e as Error).message}`);
    }
    renderActions();
  };

  /** Folha de poses: uma miniatura por figura com o seletor da pose. */
  const renderMap = () => {
    if (!result) return;
    sheetMap = result.frames.map((_, i) => sheetMap[i] ?? SHEET_ORDER[i] ?? '');
    mapBox.append(h('div', { class: 'muted', style: 'font-size:12px', text: 'Figuras encontradas (esquerda → direita, linha a linha). Escolha a pose de cada uma; a de "Parado" também vira a imagem parada.' }));
    const row = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' });
    result.frames.forEach((f, i) => {
      const cv = toCanvas(f);
      cv.className = 'spr-cell';
      const sel = h('select', {}) as HTMLSelectElement;
      sel.append(h('option', { value: '', text: '— ignorar —' }));
      for (const p of POSES) sel.append(h('option', { value: p, text: POSE_LABEL[p] ?? p }));
      for (const sk of c.skills) sel.append(h('option', { value: `skill:${sk.id}`, text: `Hab.: ${sk.name}` }));
      sel.value = sheetMap[i]!;
      sel.addEventListener('change', () => (sheetMap[i] = sel.value));
      row.append(h('div', { class: 'spr-cellbox' }, cv, sel));
    });
    mapBox.append(row);
  };

  /** O que gravar: espaço, imagem, quadros e fps. */
  const writes = (): { slot: string; img: Rgba; frames: number; fps?: number }[] => {
    if (!result) return [];
    if (slot === 'base') return [{ slot: 'base', img: result.frames[0]!, frames: 1 }];
    if (slot === 'sheet') {
      const out: { slot: string; img: Rgba; frames: number }[] = [];
      result.frames.forEach((f, i) => {
        const m = sheetMap[i];
        if (!m) return;
        out.push({ slot: m, img: f, frames: 1 });
        if (m === 'idle') out.push({ slot: 'base', img: f, frames: 1 });
      });
      return out;
    }
    return [{ slot, img: result.sheet, frames: result.frames.length, fps }];
  };

  const renderActions = () => {
    clear(actions);
    const ok = !!result;
    actions.append(
      btn('💾 Salvar no projeto', async () => {
        try {
          const files: string[] = [];
          for (const w of writes()) {
            files.push(await saveToProject(c.id, w.slot, w.img, w.frames, w.fps));
            // Já mostra (sem guardar no navegador: o arquivo do projeto passa a valer).
            mergeArtSlot(c.id, w.slot, pngDataUrl(w.img), w.frames, w.fps);
          }
          toast(files.length ? `Gravado: ${files.join(', ')}` : 'Nada para gravar.');
          onSaved();
        } catch (e) {
          toast(`Não gravou: ${(e as Error).message}`);
        }
      }, { class: 'primary', disabled: !ok || devServer === false, title: devServer === false ? 'Só no npm run dev (servidor de desenvolvimento).' : 'Grava o PNG em public/ e a entrada em sprite_art.json.' }),
      btn('✔ Usar neste navegador', () => {
        for (const w of writes()) saveLocalSprite({ id: c.id, slot: w.slot, dataUrl: pngDataUrl(w.img), frames: w.frames, fps: w.fps });
        toast('Arte aplicada neste navegador.');
        onSaved();
      }, { disabled: !ok, title: 'Guarda no navegador (localStorage) e já mostra no jogo.' }),
      btn('⬇ Baixar PNG', () => {
        for (const w of writes()) download(w.img, w.slot === 'base' ? `${c.id}.png` : `${w.slot.replace(':', '_')}.png`);
      }, { disabled: !ok }),
    );
  };

  const load = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!list.length) return;
    raw = await Promise.all(list.map(readImage));
    names = list.map((f) => f.name);
    sheetMap = [];
    clear(original);
    for (const [i, s] of raw.entries()) {
      const cv = toCanvas(s);
      cv.className = 'spr-thumb';
      cv.title = names[i]!;
      original.append(cv);
    }
    if (raw.length > 1 && (slot === 'base' || slot === 'sheet')) {
      slot = 'idle';
      slotSel.value = slot;
    } else if (raw.length === 1 && raw[0]!.width > raw[0]!.height * 1.6 && slot === 'base') {
      // Imagem bem larga: provavelmente uma folha de poses.
      slot = 'sheet';
      slotSel.value = slot;
    }
    recompute();
  };

  // Controles.
  const num = (label: string, key: 'height' | 'colors' | 'tolerance' | 'pad', min: number, max: number, help: string) => {
    const input = attrs(h('input', { type: 'number', value: String(opts[key]), style: 'width:64px' }), { min: String(min), max: String(max) });
    input.addEventListener('change', () => {
      opts[key] = Math.max(min, Math.min(max, Number(input.value) || 0));
      input.value = String(opts[key]);
      recompute();
    });
    return h('label', { class: 'row', style: 'gap:6px', title: help }, h('span', { style: 'min-width:110px', text: label }), input);
  };
  const flip = h('input', { type: 'checkbox' }) as HTMLInputElement;
  flip.checked = opts.flip;
  flip.addEventListener('change', () => {
    opts.flip = flip.checked;
    recompute();
  });
  const slotSel = h('select', {}) as HTMLSelectElement;
  slotSel.append(h('option', { value: 'base', text: 'Imagem parada (retrato e reserva)' }));
  slotSel.append(h('option', { value: 'sheet', text: 'Folha de poses (várias poses numa imagem)' }));
  for (const p of POSES) slotSel.append(h('option', { value: p, text: `Animação: ${POSE_LABEL[p] ?? p}` }));
  for (const sk of c.skills) slotSel.append(h('option', { value: `skill:${sk.id}`, text: `Habilidade: ${sk.name}` }));
  slotSel.addEventListener('change', () => {
    slot = slotSel.value;
    recompute();
  });
  const fpsIn = attrs(h('input', { type: 'number', value: String(fps), style: 'width:56px' }), { min: '1', max: '30' });
  fpsIn.addEventListener('change', () => {
    fps = Math.max(1, Math.min(30, Number(fpsIn.value) || 8));
    recompute();
  });

  const fileIn = attrs(h('input', { type: 'file' }), { accept: 'image/*', multiple: '' });
  fileIn.addEventListener('change', () => fileIn.files && void load(fileIn.files));
  const drop = h('div', { class: 'spr-drop' }, h('div', { text: '⬇ Arraste aqui a imagem gerada (ou várias: viram os quadros de uma animação, na ordem do nome)' }), fileIn);
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer?.files) void load(e.dataTransfer.files);
  });

  // Lote: imagem parada de várias criaturas, pelo nome do arquivo.
  const batchIn = attrs(h('input', { type: 'file' }), { accept: 'image/*', multiple: '' });
  batchIn.addEventListener('change', async () => {
    clear(batchLog);
    const server = await canSaveToProject();
    for (const f of [...(batchIn.files ?? [])]) {
      const id = idFromFileName(f.name);
      if (!DB.creatures[id]) {
        batchLog.append(h('div', { style: 'color:#e57373', text: `✖ ${f.name}: nenhuma criatura com id "${id}"` }));
        continue;
      }
      try {
        const r = importSprite([await readImage(f)], opts);
        const img = r.frames[0]!;
        if (server) {
          await saveToProject(id, 'base', img, 1);
          mergeArtSlot(id, 'base', pngDataUrl(img), 1);
        } else saveLocalSprite({ id, slot: 'base', dataUrl: pngDataUrl(img), frames: 1 });
        batchLog.append(h('div', { style: 'color:#81c784', text: `✔ ${DB.creatures[id]!.name}: ${img.width}×${img.height}${server ? ' · gravado no projeto' : ' · neste navegador'}` }));
      } catch (e) {
        batchLog.append(h('div', { style: 'color:#e57373', text: `✖ ${f.name}: ${(e as Error).message}` }));
      }
    }
    onSaved();
  });

  modal(
    `🖼 Importar sprite — ${c.name}`,
    (body) => {
      body.append(
        h('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px', text: 'Converte a imagem gerada em pixel art do jogo: tira o fundo (a cor das bordas), recorta, encaixa os pés embaixo, reduz cada "pixel" da IA a 1 pixel e limpa a paleta. O jogo espelha sozinho quando a criatura vira; deixe olhando para a direita.' }),
        drop,
        h('div', { class: 'spr-grid' },
          h('div', {}, h('b', { text: 'Original' }), original),
          h('div', {}, h('b', { text: 'No jogo' }), prev.el, info),
          h('div', { class: 'spr-controls' },
            h('label', { class: 'row', style: 'gap:6px' }, h('span', { style: 'min-width:110px', text: 'Onde usar' }), slotSel),
            num('Altura (px)', 'height', IMPORT_LIMITS.minHeight, IMPORT_LIMITS.maxHeight, 'Altura final em pixels de arte. Mais alto = mais detalhe (o tamanho na tela vem do campo Tamanho da criatura).'),
            num('Cores (máx.)', 'colors', 0, IMPORT_LIMITS.maxColors, 'Reduz a paleta para tirar o ruído da IA (0 = não reduz).'),
            num('Tolerância do fundo', 'tolerance', 0, 120, 'Quanto uma cor pode diferir do fundo para sumir. Suba se sobrar borda; desça se comer o desenho.'),
            num('Margem (px)', 'pad', 0, 8, 'Pixels transparentes em volta.'),
            h('label', { class: 'row', style: 'gap:6px' }, h('span', { style: 'min-width:110px', text: 'Espelhar' }), flip),
            h('label', { class: 'row', style: 'gap:6px' }, h('span', { style: 'min-width:110px', text: 'Quadros/s' }), fpsIn),
          ),
        ),
        mapBox,
        actions,
        h('h3', { class: 'gold', style: 'margin-top:12px', text: 'Lote (imagem parada de várias criaturas)' }),
        h('div', { class: 'muted', style: 'font-size:12px', text: 'Selecione vários arquivos com o nome do id da criatura (ex.: urso_chifre.png, "Urso Chifre.png" também vale). Usa os ajustes acima.' }),
        batchIn,
        batchLog,
      );
      recompute();
      void canSaveToProject().then(renderActions);
    },
    { wide: true, onClose: () => prev.stop() },
  );
}
