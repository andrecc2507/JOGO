import { Rng, Scene } from '@core';
import { btn, clear, h, layer, toast } from '@ui/dom';
import { DB, type NodeBonus, type SkillTree, type TreeNode, type TreeNodeType, type TreeSkill } from '../../data';
import { Audio } from '../../audio/audio';
import { describeSkill } from '../../bestiary/describe';
import { unitFromCharacter, unitFromEnemy } from '../../battle/units';
import { DevPanel } from '../../dev/dev_panel';
import { devPlayerUnits } from '../../dev/dev_squad';
import { generateMap } from '../../mapgen/generator';
import { makeCharacter } from '../../rules/recruit';
import { DEFAULT_UNLOCK_AT, nodeSkillIds, unlockSkillOf } from '../../rules/skill_tree';
import { hasTreeEdits, loadTrees, resetTrees, saveTrees } from '../../skill_trees/tree_store';
import { field, skillCard } from '../shared/skill_form';
import { skillWeb } from '../shared/skill_web';

const BONUS_FIELDS: [keyof NodeBonus, string][] = [['hp', 'HP máx.'], ['mp', 'MP máx.'], ['str', 'Força'], ['dex', 'Destreza'], ['int', 'Inteligência'], ['accuracy', 'Acerto'], ['speed', 'Velocidade'], ['magic', 'Dano mágico']];

/** Texto curto dos bônus de classe de um nó. */
function bonusText(n: TreeNode): string {
  const parts = BONUS_FIELDS.filter(([k]) => n.bonus?.[k]).map(([k, l]) => `+${Math.round(n.bonus![k]! * 100)}% ${l}`);
  if (n.mpBonus) parts.unshift(`+${n.mpBonus} MP`);
  return parts.join(' · ');
}

const TYPE_LABEL: Record<TreeNodeType, string> = { base: 'Classe base', evolucao: 'Evolução', hibrida: 'Híbrida', ramo: 'Ramo' };
const TYPE_COLOR: Record<TreeNodeType, string> = { base: '#ffd54f', evolucao: '#4fc3f7', hibrida: '#ce93d8', ramo: '#a5d6a7' };
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
  private web!: HTMLDivElement;
  private summary!: HTMLDivElement;
  /** Habilidade clicada na teia (a ficha dela fica em destaque). */
  private skillId: string | null = null;

  protected override onEnter(): void {
    Audio.music('editor');
    this.trees = loadTrees();
    this.treeIndex = Math.min(last.tree, this.trees.length - 1);
    this.nodeId = this.tree?.nodes.some((n) => n.id === last.node) ? last.node : this.tree?.nodes[0]?.id ?? '';
    this.ui = layer('skill-trees-ui');
    this.form = h('div', { class: 'panel', style: 'left:8px;top:8px;bottom:8px;width:min(600px,56vw);overflow:auto' });
    this.side = h('div', { class: 'panel', style: 'right:8px;top:8px;width:min(520px,42vw);max-height:calc(100vh - 16px);overflow:auto' });
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
    el.append(
      section(
        'Nó',
        text('Nome', n.name, (v) => (n.name = v)),
        text('Descrição', n.description, (v) => (n.description = v), true),
        h('div', { class: 'row', style: 'gap:12px' },
          select('Tipo', n.type, Object.entries(TYPE_LABEL), (v) => (n.type = v as TreeNodeType)),
          num('Bônus de MP', n.mpBonus ?? 0, (v) => (n.mpBonus = Math.max(0, Math.round(v)) || undefined), { min: 0 }),
        ),
        h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' },
          ...BONUS_FIELDS.map(([k, label]) =>
            num(label, Math.round((n.bonus?.[k] ?? 0) * 100), (v) => {
              n.bonus = { ...n.bonus, [k]: Math.round(v) / 100 || undefined };
            }, { suffix: '%' }),
          ),
        ),
        n.parents.length
          ? h('div', { class: 'row', style: 'gap:10px;align-items:center' },
              num('Abre com a habilidade nº', n.unlockAt ?? (n.type === 'ramo' ? t.nodes.find((o) => o.id === n.parents[0])?.skills.length ?? DEFAULT_UNLOCK_AT : DEFAULT_UNLOCK_AT), (v) => (n.unlockAt = Math.max(1, Math.round(v))), { min: 1 }),
              h('span', { class: 'muted', style: 'font-size:11px', text: `de cada teia: ${n.parents.map((p) => { const o = t.nodes.find((x) => x.id === p); const k = o && unlockSkillOf(o, n); return `${k?.name ?? '?'} (${o?.name ?? p})`; }).join(' e ')}` }),
            )
          : null,
        n.type === 'base' ? h('div', { class: 'muted', style: 'font-size:11px', text: 'Classe base: sem habilidades a aprender. A passiva abaixo e os bônus valem sempre.' }) : null,
      ),
      section(
        `Habilidades (${n.skills.length})`,
        n.skills.length ? null : h('p', { class: 'muted', text: 'Este nó ainda não tem habilidades.' }),
        ...n.skills.map((s, i) => {
          const card = h('div', { 'data-skill': s.id, style: s.id === this.skillId ? 'outline:2px solid #fff59d;border-radius:4px' : '' },
            n.type === 'base' ? null : this.requiresField(t, n, s, i),
            skillCard(s, hooks, () => {
              n.skills.splice(i, 1);
              this.changed();
              this.renderForm();
            }),
          );
          return card;
        }),
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

  /** Pré-requisito da habilidade: a anterior na teia (padrão), nenhum ou outra habilidade da árvore. */
  private requiresField(t: SkillTree, n: TreeNode, s: TreeSkill, i: number): HTMLElement {
    const pick = h('select', {});
    const prev = n.skills[i - 1];
    pick.append(h('option', { value: '@prev', text: prev ? `anterior na teia (${prev.name})` : 'nenhum (1ª da teia)' }), h('option', { value: '@none', text: 'nenhum' }));
    for (const o of t.nodes) for (const x of o.skills) if (x.id !== s.id && o.type !== 'base') pick.append(h('option', { value: x.id, text: `${o.name}: ${x.name}` }));
    pick.value = s.requires === undefined ? '@prev' : s.requires.length ? s.requires[0]! : '@none';
    pick.addEventListener('change', () => {
      s.requires = pick.value === '@prev' ? undefined : pick.value === '@none' ? [] : [pick.value];
      this.changed();
    });
    return h('div', { class: 'row', style: 'gap:6px;align-items:center;font-size:12px;margin-top:6px' }, h('span', { class: 'muted', text: `Habilidade ${i + 1} da teia · pré-requisito:` }), pick);
  }

  private blankSkill(n: TreeNode): TreeSkill {
    let i = n.skills.length + 1;
    const used = new Set(this.trees.flatMap((t) => t.nodes.flatMap((o) => o.skills.map((s) => s.id))));
    while (used.has(`${n.id}_habilidade_${i}`)) i++;
    return { id: `${n.id}_habilidade_${i}`, name: 'Nova habilidade', description: '', kind: 'magic', range: 4, power: 4, cooldown: 0, mp: 6, levelReq: 1 };
  }

  private selectNode(id: string, skillId: string | null = null): void {
    this.nodeId = id;
    this.skillId = skillId;
    this.renderForm();
    const card = skillId ? this.form.querySelector<HTMLElement>(`[data-skill="${skillId}"]`) : null;
    if (card) card.scrollIntoView({ block: 'start' });
    else this.form.scrollTop = 0;
  }

  // ───────────────────────────── diagrama e resumo (direita) ─────────────────────────────

  private buildSide(): void {
    this.web = h('div', { style: 'background:#10131c;border:1px solid #5a4a32;border-radius:4px;padding:4px' });
    this.summary = h('div', { class: 'col' });
    this.side.append(
      h('h3', { text: 'Teia da classe' }),
      this.web,
      h('div', { class: 'muted', style: 'font-size:11px', text: 'Clique numa habilidade para editá-la (ou no centro para a classe base). Azul: evolução · lilás: híbrida · verde: ramo · ◆ suprema · tracejado: passiva. O nome da subclasse ao fundo é só guia.' }),
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
    const t = this.tree;
    clear(this.web);
    if (!t) return;
    const base = t.nodes.find((n) => n.type === 'base');
    this.web.append(
      skillWeb({
        tree: t,
        selected: this.skillId,
        onPick: (id) => {
          const n = t.nodes.find((o) => o.skills.some((s) => s.id === id));
          if (n) this.selectNode(n.id, id);
        },
        onCenter: () => base && this.selectNode(base.id),
        maxWidth: 500,
      }),
    );
  }

  private renderSummary(): void {
    const el = this.summary;
    clear(el);
    const n = this.node;
    if (!n) return;
    el.append(h('h3', { style: `margin-top:8px;color:${TYPE_COLOR[n.type]}`, text: `${n.name} — ${TYPE_LABEL[n.type]}${bonusText(n) ? ` · ${bonusText(n)}` : ''}` }));
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
    c.skills = [...nodeSkillIds(n), ...n.parents.flatMap((p) => { const o = t.nodes.find((x) => x.id === p); const k = o && unlockSkillOf(o, n); return k ? [k.id] : []; })];
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
