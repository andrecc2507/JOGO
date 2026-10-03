/**
 * Plugin do Vite (só no `npm run dev`): recebe os sprites convertidos pelo importador do Bestiário e
 * grava no projeto — o PNG em `public/assets/sprites/criaturas/` e a entrada em
 * `src/game/data/sprite_art.json`. No build publicado não existe: lá o importador só guarda no
 * navegador e oferece o download.
 *
 * POST /__dev/sprite  { id, slot, frames, fps?, png (base64) }
 *   slot: 'base' (imagem parada), uma pose ('idle', 'move'…) ou 'skill:<id>'.
 * GET  /__dev/sprite  → { ok: true } (o jogo usa para saber se pode gravar).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const SLOT = /^(base|idle|move|jump|hurt|fallen|dead|attack|cast|skill:[a-z0-9_]+)$/;
const ID = /^[a-z0-9_]+$/;

export function spriteDevServer(root: string): Plugin {
  const manifest = join(root, 'src/game/data/sprite_art.json');
  // Gravação nossa no manifesto não recarrega a página (o importador já registra a arte na hora;
  // recarregar perderia o que estava aberto no Bestiário).
  let lastWrite = 0;
  return {
    name: 'jogo-sprite-dev-server',
    apply: 'serve',
    handleHotUpdate(ctx) {
      if (ctx.file.replace(/\\/g, '/') === manifest.replace(/\\/g, '/') && Date.now() - lastWrite < 3000) return [];
      return undefined;
    },
    configureServer(server) {
      server.middlewares.use('/__dev/sprite', (req, res) => {
        const reply = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET') return reply(200, { ok: true });
        if (req.method !== 'POST') return reply(405, { error: 'use POST' });
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          try {
            const { id, slot, frames, fps, png } = JSON.parse(raw) as { id: string; slot: string; frames: number; fps?: number; png: string };
            if (!ID.test(id) || !SLOT.test(slot) || !png) return reply(400, { error: 'id, slot ou png inválidos' });
            const rel = slot === 'base' ? `assets/sprites/criaturas/${id}.png` : `assets/sprites/criaturas/${id}/${slot.replace(':', '_')}.png`;
            const file = join(root, 'public', rel);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, Buffer.from(png, 'base64'));
            const art = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, { base?: string; anims?: Record<string, unknown> }>;
            const entry = (art[id] ??= { anims: {} });
            if (slot === 'base') entry.base = rel;
            else (entry.anims ??= {})[slot] = fps ? { frames: Math.max(1, frames | 0), fps } : Math.max(1, frames | 0);
            lastWrite = Date.now();
            writeFileSync(manifest, JSON.stringify(art, null, 2) + '\n');
            reply(200, { ok: true, file: `public/${rel}` });
          } catch (e) {
            reply(500, { error: String(e) });
          }
        });
      });
    },
  };
}
