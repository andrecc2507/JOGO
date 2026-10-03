import { Rng, Scene } from '@core';
import { btn, clear, h, layer } from '@ui/dom';
import { ATTRS, ATTR_LABEL, DB, type Attr, type ClassId, type TreeNode } from '../../data';
import { Audio } from '../../audio/audio';
import INTRO from '../../data/story/intro.json';
import CLASS_PITCH from '../../data/story/class_pitch.json';
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES, allocate, derive, statCost, type Character } from '../../rules/character';
import { blankCharacter, randomName, resetAttributes } from '../../rules/recruit';
import { spriteFor } from '../../render/sprites';
import { saveGame, store } from '../../state/store';
import { SQUAD_COLORS, SQUAD_ICONS, newCampaign } from '../../world/campaign';
import type { DifficultyId } from '../../world/difficulty';
import { setFlag, speakerOf, type StoryLine } from '../../world/story';
import { levelAttack } from '../../rules/stats';

/**
 * Começo da campanha (estilo XCOM): abertura, nome do comandante (que não luta), o primeiro esquadrão
 * (nome, emblema, cor) e os seis heróis — cada um com nome e aparência, classe escolhida numa tela
 * cheia que mostra os caminhos futuros, e atributos distribuídos com a explicação de cada um.
 */
export interface CreationParams {
  difficulty: DifficultyId;
  ironman: boolean;
  tutorial: boolean;
  slot: string;
}

const BASE_CLASSES: ClassId[] = ['guerreiro', 'arqueiro', 'mago', 'clerigo', 'ladrao'];
const SQUAD_SIZE = 6;

/** O que cada atributo faz (tela de atributos). */
export const ATTR_HELP: Record<Attr, string> = {
  str: 'Dano de espadas, machados e lanças e das habilidades físicas de corpo a corpo.',
  dex: 'Acerto e crítico; é o atributo de dano de arcos e facas.',
  spd: 'A barra de ação enche mais rápido (o herói age mais vezes) e melhora a esquiva.',
  int: 'Poder e reserva de mana (MP), dano e cura mágicos e resistência à magia.',
  vit: 'Vida máxima: quanto mais VIT, mais golpes o herói aguenta antes de cair.',
};

interface Pitch {
  tagline: string;
  text: string;
  plays: string;
}
const PITCH = CLASS_PITCH as Record<string, Pitch>;

type Step = 'intro' | 'commander' | 'squad' | 'roster' | 'identity' | 'class' | 'attrs';

export class CreationScene extends Scene<CreationParams> {
  readonly id = 'creation';
  private ui!: HTMLDivElement;
  private root!: HTMLDivElement;
  private params!: CreationParams;
  private rng = new Rng(Date.now() % 1e9);
  private step: Step = 'intro';
  private introIdx = 0;
  private commander = '';
  private squad = { name: '', icon: '⚔', color: SQUAD_COLORS[0]! };
  private heroes: (Character | null)[] = Array.from({ length: SQUAD_SIZE }, () => null);
  /** Herói em edição (antes de confirmar). */
  private draft: { slot: number; name: string; appearance: Character['appearance']; classId: ClassId; ch?: Character } | null = null;
  private viewClass: ClassId = 'guerreiro';
  private viewEvo = 0;

  protected override onEnter(params: CreationParams): void {
    this.params = params;
    Audio.music('menu');
    this.ui = layer('creation-ui');
    this.root = h('div', { class: 'creation' });
    this.ui.append(this.root);
    this.draw();
  }

  protected override onExit(): void {
    this.ui.remove();
  }

  private go(step: Step): void {
    this.step = step;
    this.draw();
  }

  private draw(): void {
    clear(this.root);
    this.root.dataset.step = this.step;
    ({ intro: () => this.renderIntro(), commander: () => this.renderCommander(), squad: () => this.renderSquad(), roster: () => this.renderRoster(), identity: () => this.renderIdentity(), class: () => this.renderClass(), attrs: () => this.renderAttrs() })[this.step]();
  }

  // ───────────────────────────── abertura ─────────────────────────────

  private renderIntro(): void {
    const lines = [...(INTRO as StoryLine[]).slice(0, 3), ...(EXTRA_INTRO as StoryLine[])];
    const shown = lines.slice(0, this.introIdx + 1);
    const box = h('div', { class: 'cr-intro' });
    for (const [i, l] of shown.entries()) {
      const sp = speakerOf(l.s, 'Comandante');
      box.append(h('p', { class: `cr-intro-line ${i === shown.length - 1 ? 'current' : ''}` }, l.s === 'narr' ? '' : h('b', { style: `color:${sp.color}`, text: `${sp.name}: ` }), l.t));
    }
    const last = this.introIdx >= lines.length - 1;
    this.root.append(
      h('div', { class: 'cr-title', text: 'Prólogo' }),
      box,
      h('div', { class: 'cr-actions' },
        btn('Pular', () => this.go('commander'), { class: 'ghost' }),
        btn(last ? 'Continuar ▸' : 'Continuar ▸', () => {
          if (last) this.go('commander');
          else {
            this.introIdx += 1;
            this.draw();
          }
        }, { class: 'primary' }),
      ),
    );
  }

  // ───────────────────────────── comandante ─────────────────────────────

  private renderCommander(): void {
    const input = h('input', { type: 'text', value: this.commander, placeholder: 'Nome do comandante', class: 'cr-input' });
    input.maxLength = 24;
    const ok = () => {
      this.commander = input.value.trim() || 'Comandante';
      this.go('squad');
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    this.root.append(
      h('div', { class: 'cr-title', text: 'O Comandante' }),
      h('p', { class: 'cr-lead', text: 'Na Praça Imperial, o arauto ergue o pergaminho da patente. Falta um nome. O seu.' }),
      h('p', { class: 'cr-note', text: 'Você é o comandante: decide, ordena e responde pelas vidas dos seus soldados — mas não luta. Quem vai a campo são os heróis que você escolher.' }),
      input,
      h('div', { class: 'cr-actions' }, btn('◂ Voltar', () => this.go('intro'), { class: 'ghost' }), btn('Assinar a patente ▸', ok, { class: 'primary' })),
    );
    setTimeout(() => input.focus(), 0);
  }

  // ───────────────────────────── esquadrão ─────────────────────────────

  private renderSquad(): void {
    const name = h('input', { type: 'text', value: this.squad.name, placeholder: 'Nome do esquadrão (ex.: Lâminas de Valdoria)', class: 'cr-input' });
    name.maxLength = 28;
    name.addEventListener('input', () => (this.squad.name = name.value));
    const icons = h('div', { class: 'cr-icons' });
    for (const ic of SQUAD_ICONS.filter(Boolean)) icons.append(btn(ic, () => ((this.squad.icon = ic), this.draw()), { class: `cr-icon ${this.squad.icon === ic ? 'active' : ''}` }));
    const colors = h('div', { class: 'row' });
    for (const col of SQUAD_COLORS) colors.append(h('span', { class: `swatch ${this.squad.color === col ? 'selected' : ''}`, style: `background:${col}`, onClick: () => ((this.squad.color = col), this.draw()) }));
    const banner = h('div', { class: 'cr-banner', style: `border-color:${this.squad.color};color:${this.squad.color}` }, h('div', { class: 'cr-banner-icon', text: this.squad.icon }), h('div', { text: this.squad.name || 'Seu esquadrão' }));
    this.root.append(
      h('div', { class: 'cr-title', text: 'O Primeiro Esquadrão' }),
      h('p', { class: 'cr-lead', text: `"Comandante ${this.commander}, a Coroa lhe confia seis soldados. Dê a eles um nome e um estandarte."` }),
      h('div', { class: 'cr-squad' }, banner, h('div', { class: 'col', style: 'gap:10px;flex:1' }, name, h('div', { class: 'muted', text: 'Emblema' }), icons, h('div', { class: 'muted', text: 'Cor' }), colors)),
      h('div', { class: 'cr-actions' },
        btn('◂ Voltar', () => this.go('commander'), { class: 'ghost' }),
        btn('Recrutar os seis ▸', () => {
          this.squad.name = this.squad.name.trim() || 'Guarda Real';
          this.go('roster');
        }, { class: 'primary' }),
      ),
    );
  }

  // ───────────────────────────── elenco ─────────────────────────────

  private portrait(classId: ClassId, appearance: Character['appearance'], outfit?: string, scale = 5): HTMLCanvasElement {
    const cls = DB.classes[classId];
    const img = spriteFor({ classId, beast: false, color: cls.color, dark: cls.dark, hairColor: appearance.hairColor, hairStyle: appearance.hairStyle, skin: appearance.skin, outfit });
    const cv = document.createElement('canvas');
    cv.width = img.width * scale;
    cv.height = img.height * scale;
    cv.className = 'cr-portrait';
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }

  private randomAppearance(): Character['appearance'] {
    return { hairStyle: this.rng.int(0, HAIR_STYLES - 1), hairColor: this.rng.pick(HAIR_COLORS), skin: this.rng.pick(SKIN_TONES) };
  }

  private renderRoster(): void {
    const grid = h('div', { class: 'cr-roster' });
    this.heroes.forEach((ch, i) => {
      const card = h('div', { class: `cr-slot ${ch ? 'done' : ''}`, onClick: () => this.editSlot(i) });
      if (ch) {
        card.append(
          this.portrait(ch.classId, ch.appearance, undefined, 4),
          h('b', { text: ch.name }),
          h('div', { class: 'gold', text: DB.classes[ch.classId].name }),
          h('div', { class: 'muted', style: 'font-size:11px', text: ATTRS.map((a) => `${ATTR_LABEL[a].slice(0, 3).toUpperCase()} ${ch.attrs[a]}`).join(' · ') }),
          h('div', { class: 'muted', style: 'font-size:11px', text: 'clique para refazer' }),
        );
      } else card.append(h('div', { class: 'cr-slot-empty', text: '+' }), h('div', { class: 'muted', text: `Soldado ${i + 1}` }));
      grid.append(card);
    });
    const done = this.heroes.filter(Boolean).length;
    this.root.append(
      h('div', { class: 'cr-title', text: `${this.squad.icon} ${this.squad.name}` }),
      h('p', { class: 'cr-lead', text: 'Seis soldados. Cada um com nome, rosto e um caminho. Alguns não voltarão — por isso importa quem eles são.' }),
      grid,
      h('div', { class: 'cr-actions' },
        btn('◂ Estandarte', () => this.go('squad'), { class: 'ghost' }),
        btn('🎲 Completar os vagos ao acaso', () => this.fillRandom(), { class: 'ghost', disabled: done === SQUAD_SIZE }),
        btn(`⚔ Apresentar-se ao rei (${done}/${SQUAD_SIZE})`, () => this.finish(), { class: 'primary', disabled: done < SQUAD_SIZE }),
      ),
    );
  }

  private editSlot(i: number): void {
    const ch = this.heroes[i];
    this.draft = { slot: i, name: ch?.name ?? randomName(this.rng), appearance: ch ? { ...ch.appearance } : this.randomAppearance(), classId: ch?.classId ?? BASE_CLASSES[i % BASE_CLASSES.length]! };
    this.viewClass = this.draft.classId;
    this.viewEvo = 0;
    this.go('identity');
  }

  private fillRandom(): void {
    this.heroes = this.heroes.map((ch, i) => {
      if (ch) return ch;
      const classId = BASE_CLASSES[(i + this.rng.int(0, 4)) % BASE_CLASSES.length]!;
      const c = blankCharacter(this.rng, { classId, name: randomName(this.rng), appearance: this.randomAppearance() });
      autoSpend(c);
      return c;
    });
    this.draw();
  }

  // ───────────────────────────── nome e aparência ─────────────────────────────

  private renderIdentity(): void {
    const d = this.draft!;
    const name = h('input', { type: 'text', value: d.name, class: 'cr-input' });
    name.maxLength = 20;
    name.addEventListener('input', () => (d.name = name.value));
    const opt = (label: string, ...items: HTMLElement[]) => h('div', { class: 'cr-opt' }, h('span', { class: 'muted', text: label }), h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap' }, ...items));
    const styles = Array.from({ length: HAIR_STYLES }, (_, i) => btn(String(i + 1), () => ((d.appearance.hairStyle = i), this.draw()), { class: `small ${d.appearance.hairStyle === i ? 'active' : ''}` }));
    const hair = HAIR_COLORS.map((col) => h('span', { class: `swatch ${d.appearance.hairColor === col ? 'selected' : ''}`, style: `background:${col}`, onClick: () => ((d.appearance.hairColor = col), this.draw()) }));
    const skin = SKIN_TONES.map((col) => h('span', { class: `swatch ${d.appearance.skin === col ? 'selected' : ''}`, style: `background:${col}`, onClick: () => ((d.appearance.skin = col), this.draw()) }));
    this.root.append(
      h('div', { class: 'cr-title', text: `Soldado ${d.slot + 1} de ${SQUAD_SIZE}` }),
      h('div', { class: 'cr-identity' },
        h('div', { class: 'cr-preview' }, this.portrait(d.classId, d.appearance, undefined, 8)),
        h('div', { class: 'col', style: 'gap:12px;flex:1' },
          h('div', { class: 'muted', text: 'Nome' }),
          h('div', { class: 'row' }, name, btn('🎲', () => ((d.name = randomName(this.rng)), this.draw()), { class: 'small', title: 'Sortear nome' })),
          opt('Cabelo', ...styles),
          opt('Cor do cabelo', ...hair),
          opt('Pele', ...skin),
          btn('🎲 Aparência ao acaso', () => ((d.appearance = this.randomAppearance()), this.draw()), { class: 'small ghost' }),
        ),
      ),
      h('div', { class: 'cr-actions' },
        btn('◂ Elenco', () => this.go('roster'), { class: 'ghost' }),
        btn('Escolher a classe ▸', () => {
          d.name = d.name.trim() || randomName(this.rng);
          this.go('class');
        }, { class: 'primary' }),
      ),
    );
  }

  // ───────────────────────────── classe (tela cheia) ─────────────────────────────

  private evolutions(cls: ClassId): TreeNode[] {
    const nodes = DB.trees[cls]?.nodes ?? [];
    return [...nodes.filter((n) => n.type === 'evolucao'), ...nodes.filter((n) => n.type === 'hibrida')];
  }

  /** Habilidades que mais chamam atenção de uma evolução: a suprema e duas ativas fortes. */
  private highlights(n: TreeNode): { name: string; description: string; ultimate?: boolean }[] {
    const sk = n.skills;
    const ult = sk.filter((s) => s.ultimate);
    const rest = sk
      .filter((s) => !s.ultimate && s.kind !== 'passive')
      .sort((a, b) => (b.power ?? 0) + (b.radius ?? 0) * 3 - ((a.power ?? 0) + (a.radius ?? 0) * 3))
      .slice(0, 2);
    return [...ult.slice(0, 1), ...rest].map((s) => ({ name: s.name, description: s.description, ultimate: s.ultimate }));
  }

  private renderClass(): void {
    const d = this.draft!;
    const cls = this.viewClass;
    const def = DB.classes[cls];
    const pitch = PITCH[cls];
    const evos = this.evolutions(cls);
    const evo = evos[Math.max(0, Math.min(this.viewEvo, evos.length - 1))];
    const tabs = h('div', { class: 'cr-class-tabs' });
    for (const c of BASE_CLASSES)
      tabs.append(btn(DB.classes[c].name, () => ((this.viewClass = c), (this.viewEvo = 0), this.draw()), { class: `cr-tab ${c === cls ? 'active' : ''}` }));
    const evoBar = h('div', { class: 'cr-evo-bar' });
    evos.forEach((n, i) =>
      evoBar.append(btn(`${n.type === 'hibrida' ? '⬡ ' : ''}${n.name}`, () => ((this.viewEvo = i), this.draw()), { class: `small ${i === this.viewEvo ? 'active' : ''}` })),
    );
    const evoPanel = evo
      ? h('div', { class: 'cr-evo' },
          h('div', { class: 'cr-evo-head' },
            this.portrait(cls, d.appearance, `${cls}:${evo.id}`, 6),
            h('div', {},
              h('div', { class: 'cr-evo-name', text: `${evo.type === 'hibrida' ? 'Combinação · ' : 'Evolução · '}${evo.name}` }),
              h('div', { class: 'cr-evo-desc', text: evo.description }),
            ),
          ),
          h('div', { class: 'cr-skills' },
            ...this.highlights(evo).map((s) => h('div', { class: `cr-skill ${s.ultimate ? 'ult' : ''}` }, h('b', { text: `${s.ultimate ? '★ ' : ''}${s.name}` }), h('div', { text: s.description }))),
          ),
          h('div', { class: 'row', style: 'justify-content:space-between' },
            btn('◂', () => ((this.viewEvo = (this.viewEvo - 1 + evos.length) % evos.length), this.draw()), { class: 'small' }),
            h('span', { class: 'muted', text: `${this.viewEvo + 1} / ${evos.length}` }),
            btn('▸', () => ((this.viewEvo = (this.viewEvo + 1) % evos.length), this.draw()), { class: 'small' }),
          ),
        )
      : h('div', {});
    this.root.append(
      h('div', { class: 'cr-title', text: `${d.name} — escolha o caminho` }),
      tabs,
      h('div', { class: 'cr-class' },
        h('div', { class: 'cr-class-left' },
          this.portrait(cls, d.appearance, undefined, 10),
          h('div', { class: 'cr-class-name', text: def.name }),
          h('div', { class: 'gold', text: pitch?.tagline ?? def.role }),
          h('p', { text: pitch?.text ?? def.role }),
          h('p', { class: 'muted', text: pitch?.plays ?? '' }),
        ),
        h('div', { class: 'cr-class-right' },
          h('div', { class: 'section-title', text: 'Caminhos futuros' }),
          evoBar,
          evoPanel,
          h('p', { class: 'cr-note', text: 'São apenas ideias do que esta classe pode virar. A teia é livre: cada herói pode percorrer os caminhos que você quiser, misturar evoluções e chegar a duas supremas.' }),
        ),
      ),
      h('div', { class: 'cr-actions' },
        btn('◂ Aparência', () => this.go('identity'), { class: 'ghost' }),
        btn(`Confirmar: ${def.name} ▸`, () => {
          d.classId = cls;
          d.ch = blankCharacter(this.rng, { classId: cls, name: d.name, appearance: d.appearance });
          this.go('attrs');
        }, { class: 'primary' }),
      ),
    );
  }

  // ───────────────────────────── atributos ─────────────────────────────

  private renderAttrs(): void {
    const d = this.draft!;
    const ch = d.ch!;
    const der = derive(ch);
    const bias = DB.classes[ch.classId].bias ?? {};
    const rows = h('div', { class: 'cr-attrs' });
    for (const a of ATTRS) {
      const cost = statCost(ch.attrs[a]);
      const rec = (bias[a] ?? 0) >= 2;
      rows.append(
        h('div', { class: `cr-attr ${rec ? 'rec' : ''}` },
          h('div', { class: 'cr-attr-head' },
            h('b', { text: `${ATTR_LABEL[a]}${rec ? ' ★' : ''}` }),
            h('span', { class: 'cr-attr-val', text: String(ch.attrs[a]) }),
            btn('+', () => (allocate(ch, a), this.draw()), { class: 'small primary', disabled: ch.statPoints < cost }),
            h('span', { class: 'muted', style: 'font-size:11px', text: `custo ${cost}` }),
          ),
          h('div', { class: 'cr-attr-help', text: ATTR_HELP[a] }),
        ),
      );
    }
    const magicWeapon = der.weaponType === 'varinha' || der.weaponType === 'bastao' ? der.weaponAtk : 0;
    const lv = levelAttack(ch.level);
    this.root.append(
      h('div', { class: 'cr-title', text: `${ch.name} · ${DB.classes[ch.classId].name}` }),
      h('div', { class: 'cr-tutorial' },
        h('b', { text: '🎓 Como funcionam os atributos' }),
        h('div', { text: `Você tem ${ch.statPoints} ponto(s) para distribuir. Cada ponto custa mais conforme o atributo sobe — especializar sai caro, equilibrar sai barato. ★ marca o que a classe aproveita melhor. Pontos que sobrarem ficam guardados para depois (Quartel → ✦ Evoluir).` }),
      ),
      h('div', { class: 'cr-attr-wrap' },
        rows,
        h('div', { class: 'cr-derived' },
          this.portrait(ch.classId, ch.appearance, undefined, 6),
          h('div', { class: 'section-title', text: 'Resultado' }),
          ...[
            ['Vida', `${der.maxHp}`],
            ['Mana', `${der.maxMp}`],
            ['Ataque físico', `${der.weaponAtk + der.physPower + lv}`],
            ['Ataque mágico', `${magicWeapon + der.magicPower + lv}`],
            ['Acerto / esquiva', `${Math.round(der.accuracy)} / ${Math.round(der.evasion)}`],
            ['Age a cada', `${der.actionInterval.toFixed(1)} s`],
          ].map(([k, v]) => h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'muted', text: k! }), h('b', { text: v! }))),
          h('div', { class: 'gold', style: 'margin-top:6px', text: `Pontos restantes: ${ch.statPoints}` }),
        ),
      ),
      h('div', { class: 'cr-actions' },
        btn('◂ Classe', () => this.go('class'), { class: 'ghost' }),
        btn('↺ Recomeçar', () => (resetAttributes(ch), this.draw()), { class: 'ghost' }),
        btn('🎲 Distribuir pela classe', () => (resetAttributes(ch), autoSpend(ch), this.draw()), { class: 'ghost' }),
        btn('✔ Alistar soldado', () => {
          this.heroes[d.slot] = ch;
          this.draft = null;
          this.go('roster');
        }, { class: 'primary' }),
      ),
    );
  }

  // ───────────────────────────── fim ─────────────────────────────

  private finish(): void {
    const heroes = this.heroes.filter((x): x is Character => !!x);
    const c = newCampaign(undefined, {
      difficulty: this.params.difficulty,
      ironman: this.params.ironman,
      tutorial: this.params.tutorial,
      commanderName: this.commander,
      squad: this.squad,
      heroes,
    });
    // A abertura já foi vista aqui.
    setFlag(c, 'intro');
    store.campaign = c;
    store.slot = this.params.slot;
    saveGame(this.ctx.save, this.params.slot);
    this.ctx.scenes.go('world_map');
  }
}

/** Gasta os pontos de atributo pelo viés da classe (atalhos "ao acaso"). */
function autoSpend(c: Character): void {
  const bias = DB.classes[c.classId].bias ?? {};
  const order = [...ATTRS].sort((a, b) => (bias[b] ?? 0) - (bias[a] ?? 0));
  for (let guard = 0; guard < 200; guard++) {
    const a = order.find((x) => statCost(c.attrs[x]) <= c.statPoints && (bias[x] ?? 0) > 0) ?? order.find((x) => statCost(c.attrs[x]) <= c.statPoints);
    if (!a || !allocate(c, a)) break;
    order.push(order.shift()!);
  }
}

const EXTRA_INTRO: StoryLine[] = [
  { s: 'narr', t: 'Amanhã, na Praça Imperial, o Rei Ottovar III lhe entregará a patente. Esta noite, no quartel da Citadela, ainda falta o mais importante.' },
  { s: 'narr', t: 'Um nome para assinar a patente. Um estandarte para erguer. E seis soldados que vão segui-lo — para dentro de uma guerra que nenhum de vocês ainda consegue imaginar.' },
];
