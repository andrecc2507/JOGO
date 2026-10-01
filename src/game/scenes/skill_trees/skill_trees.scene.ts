import { Rng, Scene } from '@core';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { DB, type SkillTree, type TreeNode, type TreeNodeType, type TreeSkill } from '../../data';
import { Audio } from '../../audio/audio';
import { describeSkill } from '../../bestiary/describe';
import { unitFromCharacter, unitFromEnemy } from '../../battle/units';
import { DevPanel } from '../../dev/dev_panel';
import { devPlayerUnits } from '../../dev/dev_squad';
import { generateMap } from '../../mapgen/generator';
import { makeCharacter } from '../../rules/recruit';
import { nodeSkillIds } from '../../rules/skill_tree';
import { hasTreeEdits, loadTrees, resetTrees, saveTrees } from '../../skill_trees/tree_store';
import { field, skillCard } from '../shared/skill_form';

const TYPE_LABEL: Record<TreeNodeType, string> = { base: 'Classe base', evolucao: 'Evolução', hibrida: 'Híbrida', ramo: 'Ramo' };
const TYPE_COLOR: Record<TreeNodeType, string> = { base: '#ffd54f', evolucao: '#4fc3f7', hibrida: '#ce93d8', ramo: '#a5d6a7' };
const DIAGRAM_W = 380;
const DIAGRAM_H = 300;
const NODE_W = 74;
const NODE_H = 30;
/** Última árvore/nó abertos (voltar do teste de batalha cai no mesmo lugar). */
const last = { tree: 0, node: '' };

/** Editor das rosas das classes: diagrama da árvore, ficha do nó e das habilidades. */
export class SkillTreesScene extends Scene {
  readonly id = 'skill_trees';

  private trees: SkillTree[] = [];
  private treeIndex = 0;
  private nodeId = '';
  private dirty = false;
  private ui!: HTMLDivElement;
  private form!: HTMLDivElement;
  private side!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private summary!: HTMLDivElement;
  private boxes: { id: string; x: number; y: number }[] = [];

  protected override onEnter(): void {
    Audio.music('editor');
    this.trees = loadTrees();
    this.treeIndex = Math.min(last.tree, this.trees.length - 1);
    this.nodeId = this.tree?.nodes.some((n) => n.id === last.node) ? last.node : this.tree?.nodes[0]?.id ?? '';
    this.ui = layer('skill-trees-ui');
    this.form = h('div', { class: 'panel', style: 'left:8px;top:8px;bottom:8px;width:min(600px,56vw);overflow:auto' });
    this.side = h('div', { class: 'panel', style: 'right:8px;top:8px;width:min(400px,40vw);max-height:calc(100vh - 16px);overflow:auto' });
    this.ui.append(this.form, this.side);
    this.buildSide();
    this.renderForm();
    DevPanel.setGroups([{ title: 'Árvores', actions: [{ label: 'Restaurar do repositório', run: () => this.restore() }] }]);
  }

  protected override onExit(): void {
    this.ui.remove();
    DevPanel.setGroups([]);
  }

  private get tree(): SkillTree | undefined {
    return this.trees[this.treeIndex];
  }

  private get node(): TreeNode | undefined {
    return this.tree?.nodes.find((n) => n.id === this.nodeId);
  }

  private changed(): void {
    this.dirty = true;
    this.drawDiagram();
    this.renderSummary();
  }

  // ───────────────────────────── ficha (esquerda) ─────────────────────────────

  private renderForm(): void {
    last.tree = this.treeIndex;
    last.node = this.nodeId;
    const el = this.form;
    clear(el);
    const t = this.tree;
    const header = h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: '🌹 Árvores de habilidades' }), h('span', { class: 'muted', text: hasTreeEdits() ? 'com edições locais' : 'versão do repositório' }));
    const classPick = h('select', {});
    this.trees.forEach((tr, i) => classPick.append(h('option', { value: String(i), text: `${tr.name} (${tr.nodes.reduce((a, n) => a + n.skills.length, 0)} habilidades)` })));
    classPick.value = String(this.treeIndex);
    classPick.addEventListener('change', () => {
      this.treeIndex = Number(classPick.value);
      this.nodeId = this.tree?.nodes[0]?.id ?? '';
      this.renderForm();
    });
    const nodePick = h('select', {});
    for (const n of t?.nodes ?? []) nodePick.append(h('option', { value: n.id, text: `${n.name} · ${TYPE_LABEL[n.type]} · ${n.skills.length}` }));
    nodePick.value = this.nodeId;
    nodePick.addEventListener('change', () => this.selectNode(nodePick.value));
    el.append(header, h('div', { class: 'row', style: 'gap:6px' }, classPick, nodePick));
    const n = this.node;
    if (!t || !n) {
      el.append(h('p', { class: 'muted', text: 'Nenhum nó selecionado.' }));
      this.drawDiagram();
      this.renderSummary();
      return;
    }
    const hooks = { changed: () => this.changed(), rerender: () => this.renderForm() };
    const { text, num, select } = field(hooks);
    const section = (title: string, ...rows: (Node | null)[]) => h('div', { class: 'col', style: 'margin-top:10px' }, h('h3', { text: title }), ...rows);
    const parentNames = n.parents.map((p) => t.nodes.find((o) => o.id === p)?.name ?? p).join(' + ');
    el.append(
      section(
        'Nó',
        text('Nome', n.name, (v) => (n.name = v)),
        text('Descrição', n.description, (v) => (n.description = v), true),
        h('div', { class: 'row', style: 'gap:12px' },
          select('Tipo', n.type, Object.entries(TYPE_LABEL), (v) => (n.type = v as TreeNodeType)),
          num('Bônus de MP', n.mpBonus ?? 0, (v) => (n.mpBonus = Math.max(0, Math.round(v)) || undefined), { min: 0 }),
        ),
        n.parents.length ? h('div', { class: 'muted', style: 'font-size:11px', text: `Abre com 1 habilidade aprendida em: ${parentNames}` }) : null,
        n.legacySkills?.length ? h('div', { class: 'muted', style: 'font-size:11px', text: `Habilidades antigas da classe (skills.json): ${n.legacySkills.map((id) => DB.skills[id]?.name ?? id).join(', ')}` }) : null,
      ),
      section(
        `Habilidades (${n.skills.length})`,
        n.skills.length ? null : h('p', { class: 'muted', text: n.legacySkills?.length ? 'Só as habilidades antigas da classe (acima). Adicione as novas aqui.' : 'Este nó ainda não tem habilidades.' }),
        ...n.skills.map((s, i) =>
          skillCard(s, hooks, () => {
            n.skills.splice(i, 1);
            this.changed();
            this.renderForm();
          }),
        ),
        btn('+ Habilidade', () => {
          n.skills.push(this.blankSkill(n));
          this.changed();
          this.renderForm();
        }, { class: 'small' }),
      ),
    );
    this.drawDiagram();
    this.renderSummary();
  }

  private blankSkill(n: TreeNode): TreeSkill {
    let i = n.skills.length + 1;
    const used = new Set(this.trees.flatMap((t) => t.nodes.flatMap((o) => o.skills.map((s) => s.id))));
    while (used.has(`${n.id}_habilidade_${i}`)) i++;
    return { id: `${n.id}_habilidade_${i}`, name: 'Nova habilidade', description: '', kind: 'magic', range: 4, power: 4, cooldown: 0, mp: 6, levelReq: 1 };
  }

  private selectNode(id: string): void {
    this.nodeId = id;
    this.renderForm();
    this.form.scrollTop = 0;
  }

  // ───────────────────────────── diagrama e resumo (direita) ─────────────────────────────

  private buildSide(): void {
    this.canvas = h('canvas', {});
    this.canvas.width = DIAGRAM_W;
    this.canvas.height = DIAGRAM_H;
    this.canvas.style.cssText = 'width:100%;max-width:380px;border:1px solid #5a4a32;border-radius:4px;display:block;cursor:pointer;background:#10131c';
    this.canvas.addEventListener('click', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * DIAGRAM_W;
      const y = ((e.clientY - r.top) / r.height) * DIAGRAM_H;
      const hit = this.boxes.find((b) => Math.abs(b.x - x) <= NODE_W / 2 && Math.abs(b.y - y) <= NODE_H / 2);
      if (hit) this.selectNode(hit.id);
    });
    this.summary = h('div', { class: 'col' });
    this.side.append(
      h('h3', { text: 'Rosa da classe' }),
      this.canvas,
      h('div', { class: 'muted', style: 'font-size:11px', text: 'Clique num nó para editar. Amarelo: base · azul: evolução · lilás: híbrida · verde: ramo.' }),
      this.summary,
      h('div', { class: 'col', style: 'margin-top:8px' },
        btn('💾 Salvar e aplicar no jogo', () => this.save(), { class: 'primary' }),
        btn('⚔ Testar este nó em batalha', () => this.testBattle()),
        btn('⬇ Exportar JSON da árvore', () => this.exportJson()),
        btn('📋 Copiar JSON', () => this.copyJson()),
        btn('↺ Descartar alterações', () => {
          this.trees = loadTrees();
          this.dirty = false;
          this.renderForm();
        }),
        btn('↩ Menu principal', () => this.leave()),
      ),
    );
  }

  private drawDiagram(): void {
    const g = this.canvas.getContext('2d');
    const t = this.tree;
    if (!g || !t) return;
    g.fillStyle = '#10131c';
    g.fillRect(0, 0, DIAGRAM_W, DIAGRAM_H);
    const xs = t.nodes.map((n) => n.x);
    const ys = t.nodes.map((n) => n.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const sx = (DIAGRAM_W - NODE_W - 12) / Math.max(1, maxX - minX);
    const sy = (DIAGRAM_H - NODE_H - 12) / Math.max(1, maxY - minY);
    const pos = new Map(t.nodes.map((n) => [n.id, { x: 6 + NODE_W / 2 + (n.x - minX) * sx, y: 6 + NODE_H / 2 + (n.y - minY) * sy }]));
    this.boxes = t.nodes.map((n) => ({ id: n.id, ...pos.get(n.id)! }));
    const base = t.nodes.find((n) => n.type === 'base');
    g.strokeStyle = '#5a4a32';
    g.lineWidth = 1.5;
    for (const n of t.nodes) {
      const links = n.type === 'evolucao' && base ? [base.id] : n.parents;
      for (const p of links) {
        const a = pos.get(p);
        const b = pos.get(n.id);
        if (!a || !b) continue;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const n of t.nodes) {
      const p = pos.get(n.id)!;
      const sel = n.id === this.nodeId;
      g.fillStyle = sel ? '#3a2f1e' : '#1b1f2b';
      g.fillRect(p.x - NODE_W / 2, p.y - NODE_H / 2, NODE_W, NODE_H);
      g.strokeStyle = TYPE_COLOR[n.type];
      g.lineWidth = sel ? 3 : 1.5;
      g.strokeRect(p.x - NODE_W / 2, p.y - NODE_H / 2, NODE_W, NODE_H);
      g.fillStyle = '#ece6d6';
      g.font = '10px sans-serif';
      g.fillText(n.name.replace(/^Caminho d[aoe] /, '').slice(0, 14), p.x, p.y - 5);
      g.fillStyle = n.skills.length ? '#bdbdbd' : '#ef9a9a';
      g.font = '9px sans-serif';
      g.fillText(`${n.skills.length + (n.legacySkills?.length ?? 0)} hab.`, p.x, p.y + 8);
    }
  }

  private renderSummary(): void {
    const el = this.summary;
    clear(el);
    const n = this.node;
    if (!n) return;
    el.append(h('h3', { style: `margin-top:8px;color:${TYPE_COLOR[n.type]}`, text: `${n.name} — ${TYPE_LABEL[n.type]}${n.mpBonus ? ` · +${n.mpBonus} MP` : ''}` }));
    for (const s of n.skills)
      el.append(
        h('div', { style: 'font-size:11px;margin-bottom:4px' },
          h('b', { text: `${s.ultimate ? '★ ' : ''}${s.name}`, style: s.ultimate ? 'color:#ffb300' : '' }),
          h('span', { class: 'muted', text: ` · NV ${s.levelReq ?? 1} · ${s.mp} MP — ${describeSkill(s)}` }),
        ),
      );
  }

  // ───────────────────────────── ações ─────────────────────────────

  private validate(): string | null {
    const ids = new Set<string>();
    for (const t of this.trees)
      for (const n of t.nodes)
        for (const s of n.skills) {
          if (!s.name.trim()) return `${n.name}: habilidade sem nome.`;
          if (ids.has(s.id)) return `Id repetido: ${s.id}`;
          if (DB.skills[s.id] && !DB.skills[s.id]!.tree) return `O id “${s.id}” já é de outra habilidade.`;
          ids.add(s.id);
        }
    return null;
  }

  private save(): boolean {
    const err = this.validate();
    if (err) {
      toast(err);
      return false;
    }
    saveTrees(this.trees);
    this.dirty = false;
    toast('Árvores salvas. Quartel e batalhas já usam estes valores.');
    this.renderForm();
    return true;
  }

  private restore(): void {
    this.trees = resetTrees();
    this.dirty = false;
    toast('Árvores restauradas do repositório.');
    this.renderForm();
  }

  private exportJson(): void {
    const t = this.tree;
    if (!t) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(t, null, 1)], { type: 'application/json' }));
    a.download = `${t.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Para fixar no jogo, substitua src/game/data/skills/trees/${t.id}.json por este arquivo.`);
  }

  private copyJson(): void {
    navigator.clipboard
      ?.writeText(JSON.stringify(this.tree, null, 1))
      .then(() => toast('JSON copiado.'))
      .catch(() => toast('Não foi possível copiar. Use Exportar JSON.'));
  }

  /** Batalha de teste: um personagem da classe com todas as habilidades do nó, mais o esquadrão de testes. */
  private testBattle(): void {
    const t = this.tree;
    const n = this.node;
    if (!t || !n || (this.dirty && !this.save())) return;
    const level = Math.max(10, ...n.skills.map((s) => s.levelReq ?? 1));
    const rng = new Rng(Date.now() % 1e9);
    const c = makeCharacter(rng, { classId: t.classId, level });
    c.name = `Teste: ${n.name}`;
    c.skills = [...nodeSkillIds(n), ...n.parents.flatMap((p) => t.nodes.find((o) => o.id === p)?.skills.slice(0, 1).map((s) => s.id) ?? [])];
    const tester = unitFromCharacter(c, 'player');
    tester.mp = tester.maxMp = Math.max(tester.maxMp, 200);
    const squad = devPlayerUnits(level).slice(0, 3);
    const foes = ['rebelde_guerreiro', 'rebelde_guerreiro', 'rebelde_arqueiro', 'rebelde_mago'].map((id) => unitFromEnemy(DB.enemies[id]!, level, rng));
    this.ctx.scenes.go('battle', {
      setup: {
        map: generateMap({ biome: 'planicie', seed: rng.int(1, 1e9) }),
        players: [tester, ...squad],
        enemies: foes,
        victory: { type: 'eliminate' },
        ambush: false,
        canFlee: true,
        seed: rng.int(1, 1e9),
        context: { kind: 'dev', baseXp: 0, gold: 0, itemDrops: [], title: `Teste de habilidades: ${n.name} (NV ${level})` },
      },
      returnTo: 'skill_trees',
    });
  }

  private leave(): void {
    if (this.dirty) toast('Alterações não salvas foram descartadas.');
    this.ctx.scenes.go('main_menu');
  }
}
