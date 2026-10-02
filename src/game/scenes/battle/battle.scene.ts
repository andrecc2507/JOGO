import { Scene } from '@core';
import { bar, btn, clear, h, layer, modal } from '@ui/dom';
import { DB, item, skill, type AnimStyle } from '../../data';
import { planTurn } from '../../battle/ai';
import { canStrike, mpCost, reactionState } from '../../battle/creature_fx';
import { coverSides } from '../../battle/cover';
import { diffNotices, snapshot, type Snapshot } from '../../battle/notices';
import { reactionKey, restoreBattle, runWithReactions, snapshotBattle, type BattleSnapshot, type ReactionQuestion } from '../../battle/reaction_prompt';
import { losBlocker } from '../../battle/los';
import { describeSkill } from '../../bestiary/describe';
import { BATTLE_TIME_SCALE, actionInterval } from '../../rules/stats';
import { applyElementToTile, unitAt } from '../../battle/elements';
import {
  BASIC_ATTACK,
  structureHit,
  moveBudget,
  readyable,
  activeUnit,
  areaOf,
  attack,
  buildResult,
  canCast,
  skillUsable,
  castSkill,
  comboAsSkill,
  comboOptions,
  defend,
  endTurn,
  flee,
  fleeChance,
  hide,
  hideChance,
  itemTargets,
  moveTargets,
  moveUnit,
  opponents,
  pathTo,
  previewHit,
  reachable,
  setOverwatch,
  skillRange,
  skillTargets,
  stepTime,
  deploymentTiles,
  deployUnit,
  teamVision,
  unitById,
  useItem,
  visibleToPlayer,
  createBattle,
  type ComboOption,
  type Reach,
  type SkillLike,
} from '../../battle/engine';
import { CLOUDS, PROPS, SURFACES, TERRAIN, idx, inBounds, manhattan, tileAt, xy } from '../../battle/map';
import { STATUS_INFO, VICTORY_LABEL, type BattleState, type BattleUnit, type StatusId } from '../../battle/types';
import { DevPanel } from '../../dev/dev_panel';
import { Audio, type Sfx } from '../../audio/audio';
import { drawBattle, unitSpec, type CoverMark, type Floater } from '../../render/battle_renderer';
import { ELEMENT_PALETTE, animFor, isMagicStyle, moveSpeed, paletteFor } from '../../render/anim_style';
import { BattleFx, type WorldPt } from '../../render/battle_fx';
import { portraitCanvas } from '../../render/sprites';
import { artFor, resolvePose, type UnitPose } from '../../render/sprite_anims';
import { IsoCamera } from '../../render/iso';
import { CanvasPointer } from '../../render/pointer';
import { store } from '../../state/store';
import type { BattleReturn } from '../scene_params';

type Mode =
  | { kind: 'menu' }
  | { kind: 'busy' }
  /** Formação inicial: escolher onde cada herói começa, dentro da área de início. */
  | { kind: 'deploy'; tiles: Set<number>; selected: string | null }
  | { kind: 'move'; reach: Reach; tiles: Set<number> }
  | { kind: 'target'; label: string; tiles: Set<number>; range: Set<number>; skill?: SkillLike; combo?: ComboOption; itemSlot?: number; attack?: boolean };

interface MoveAnim {
  uid: string;
  points: [number, number][];
  t: number;
  /** Tiles por segundo (depende da Velocidade). */
  speed: number;
  done: () => void;
}

const ELEMENT_COLOR: Record<string, string> = {
  fogo: 'rgba(255,120,30,0.8)',
  agua: 'rgba(80,160,255,0.8)',
  gelo: 'rgba(200,240,255,0.9)',
  eletricidade: 'rgba(255,245,90,0.9)',
  vento: 'rgba(220,255,220,0.6)',
  veneno: 'rgba(130,220,60,0.7)',
  luz: 'rgba(255,250,200,0.9)',
  sombra: 'rgba(80,40,120,0.7)',
  terra: 'rgba(140,100,60,0.7)',
  hit: 'rgba(255,255,255,0.7)',
};

export class BattleScene extends Scene<{ setup: import('../../battle/types').BattleSetup; returnTo: BattleReturn }> {
  readonly id = 'battle';
  protected override readonly systems = ['debug_overlay'];

  private state!: BattleState;
  private returnTo: BattleReturn = 'main_menu';
  private setupCtx!: import('../../battle/types').BattleContext;
  private cam = new IsoCamera(960, 540);
  private pointer!: CanvasPointer;
  private ui!: HTMLDivElement;
  private hud: Record<string, HTMLElement> = {};
  private vision = new Set<number>();
  private mode: Mode = { kind: 'menu' };
  private hover: [number, number] | null = null;
  private anim: MoveAnim | null = null;
  private displayPos = new Map<string, [number, number]>();
  private timers: { t: number; fn: () => void }[] = [];
  private floaters: Floater[] = [];
  private fx: { x: number; y: number; color: string; age: number }[] = [];
  private time = 0;
  private aiBusy = false;
  private hudFor: string | null = null;
  private ended = false;
  private bfx = new BattleFx();
  private snap!: Snapshot;
  private camTween: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null = null;
  /** Avanço do atacante em direção ao alvo durante o golpe. */
  private lunges = new Map<string, { dx: number; dy: number; start: number; end?: number }>();
  /** Deslocamento animado de investidas e saltos. */
  private travel: { uid: string; from: [number, number]; to: [number, number]; start: number; dur: number; leap: boolean } | null = null;
  private lift = new Map<string, number>();
  /** Poses da arte pronta: andando/pulando neste quadro, habilidade em uso, último dano sofrido. */
  private motion = new Map<string, 'move' | 'jump'>();
  private acting = new Map<string, { skill: string; magic: boolean }>();
  private hurtAt = new Map<string, number>();
  /** Respostas da janela de reação para a ação em andamento. */
  private decisions = new Map<string, boolean>();
  /** Janela "usar a reação?" aberta: a batalha espera. */
  private prompting = false;

  protected override onEnter(params: { setup: import('../../battle/types').BattleSetup; returnTo: BattleReturn }): void {
    this.returnTo = params.returnTo;
    this.setupCtx = params.setup.context;
    this.state = createBattle(params.setup);
    Audio.music('battle');
    this.pointer = new CanvasPointer(this.ctx.renderer);
    this.cam.zoom = Math.min(1.3, 13 / Math.max(this.state.map.w, this.state.map.h));
    this.snap = snapshot(this.state);
    this.buildUi();
    this.setupDev();
    this.refresh();
    // Antes da primeira ação: formação inicial (numa emboscada não dá tempo).
    if (params.setup.ambush) this.state.log.push('⚠ Emboscada! Sem tempo para formação.');
    else this.startDeploy();
  }

  private startDeploy(): void {
    const tiles = deploymentTiles(this.state);
    const first = this.state.units.find((u) => u.team === 'player' && u.alive);
    this.setMode({ kind: 'deploy', tiles, selected: first?.uid ?? null });
    if (first) this.focus(first.x, first.y);
  }

  private endDeploy(): void {
    this.setMode({ kind: 'menu' });
    this.snap = snapshot(this.state);
    this.refresh();
  }

  protected override onExit(): void {
    this.pointer.dispose();
    this.ui.remove();
    this.tooltip?.remove();
    DevPanel.setGroups([]);
  }

  // ───────────────────────────── loop ─────────────────────────────

  protected override onUpdate(dt: number): void {
    this.time += dt;
    this.frameDt = Math.min(dt, 0.1);
    this.updateBars();
    const { input } = this.ctx;
    if (input.justPressed('rotate_left')) this.cam.rotate(-1);
    if (input.justPressed('rotate_right')) this.cam.rotate(1);
    if (input.justPressed('cancel') && (this.mode.kind === 'move' || this.mode.kind === 'target')) this.setMode({ kind: 'menu' });
    const pan = 320 * dt;
    if (input.isDown('pan_left')) this.cam.panX += pan;
    if (input.isDown('pan_right')) this.cam.panX -= pan;
    if (input.isDown('pan_up')) this.cam.panY += pan;
    if (input.isDown('pan_down')) this.cam.panY -= pan;
    const wheel = this.pointer.takeWheel();
    if (wheel) this.cam.zoom = Math.max(0.5, Math.min(2.2, this.cam.zoom * (wheel > 0 ? 0.9 : 1.1)));
    const [dx, dy] = this.pointer.takeDrag();
    if (dx || dy) this.camTween = null;
    this.cam.panX += dx;
    this.cam.panY += dy;
    this.stepCamera(dt);
    this.hover = this.pointer.inside ? this.cam.pick(this.state.map, this.pointer.x, this.pointer.y) : null;
    for (const c of this.pointer.takeClicks()) if (c.button === 0) this.onClick();
    this.updateHoverInfo();

    for (const t of [...this.timers]) {
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(this.timers.indexOf(t), 1);
        t.fn();
      }
    }
    this.motion.clear();
    this.stepAnim(dt);
    this.stepTravel();
    this.bfx.update(dt);
    this.drainEvents();
    this.collectNotices();
    for (const [uid, l] of this.lunges) if (l.end !== undefined && this.time - l.end > 0.2) this.lunges.delete(uid);
    this.floaters = this.floaters.filter((f) => (f.age += dt) < (f.life ?? 1.2));
    this.fx = this.fx.filter((f) => (f.age += dt) < 0.6);
    if (!this.anim && !this.timers.length && !this.prompting) this.flow();
  }

  private flow(): void {
    if (this.ended || this.mode.kind === 'deploy') return;
    if (this.state.outcome) {
      this.ended = true;
      this.wait(0.6, () => this.showResult());
      return;
    }
    const u = activeUnit(this.state);
    if (!u) {
      // O tempo passa na tela: as barras de ação enchem até alguém ficar pronto (estilo Chrono Trigger).
      const dt = this.frameDt * BATTLE_TIME_SCALE;
      const round = this.state.round;
      const step = () => {
        const next = stepTime(this.state, dt);
        if (next || this.state.round !== round || this.state.outcome) this.refresh();
      };
      // A virada de rodada pode acertar alguém (zonas, bombas) e disparar reações: aí vale a janela de reação.
      if (this.state.time + dt >= this.state.nextRoundAt) this.guarded(step, () => undefined);
      else step();
      return;
    }
    if (u.team === 'enemy') {
      if (!this.aiBusy) {
        this.aiBusy = true;
        if (visibleToPlayer(this.state, u, this.vision)) this.focus(u.x, u.y);
        this.wait(0.45, () => this.runAi(u!));
      }
    } else if (this.hudFor !== u.uid) {
      this.hudFor = u.uid;
      this.undoMove = null;
      this.focus(u.x, u.y);
      Audio.sfx('turn');
      this.setMode({ kind: 'menu' });
    }
  }

  private wait(t: number, fn: () => void): void {
    this.timers.push({ t, fn });
  }

  private runAi(u: BattleUnit): void {
    const plan = planTurn(this.state, u);
    const finish = () => {
      this.refresh();
      this.wait(0.35, () => {
        this.guarded(
          () => {
            if (activeUnit(this.state) === u) endTurn(this.state);
          },
          () => {
            this.aiBusy = false;
            this.refresh();
          },
        );
      });
    };
    const act = () => {
      const a = plan.action;
      if (!a || !u.alive || this.state.outcome) {
        finish();
        return;
      }
      if (a.kind === 'defend') this.perform(u, 'Defender', 'buff', ELEMENT_PALETTE.apoio, u.x, u.y, 0, () => defend(this.state, u), finish);
      else if (a.kind === 'attack') this.performSkill(u, BASIC_ATTACK, a.x, a.y, () => attack(this.state, u, a.x, a.y), finish);
      else this.performSkill(u, a.skill, a.x, a.y, () => castSkill(this.state, u, a.skill, a.x, a.y), finish);
    };
    if (plan.moveTo) {
      const from: [number, number] = [u.x, u.y];
      const to = plan.moveTo;
      let steps: [number, number][] = [];
      this.guarded(
        () => (steps = moveUnit(this.state, u, to[0], to[1])),
        () => this.moveWithShots(u, from, steps, act),
      );
    } else act();
  }

  /**
   * Anda encenando os disparos de prontidão no passo em que aconteceram: o motor já resolveu tudo,
   * então os eventos (dano, morte) ficam guardados e só aparecem quando o tiro chega.
   */
  private moveWithShots(u: BattleUnit, from: [number, number], steps: [number, number][], done: () => void): void {
    const shots = [...(this.state.moveShots ?? [])];
    this.state.moveShots = [];
    if (!shots.length) {
      this.animateMove(u, from, steps, done);
      return;
    }
    const held = this.state.events.splice(0);
    this.dyingShown.add(u.uid);
    const leg = (pos: [number, number], from: number) => {
      const shot = shots.shift();
      if (!shot) {
        this.state.events.push(...held.splice(0));
        this.animateMove(u, pos, steps.slice(from), () => {
          this.dyingShown.delete(u.uid);
          done();
        });
        return;
      }
      const upTo = Math.max(from, Math.min(steps.length, shot.step));
      this.animateMove(u, pos, steps.slice(from, upTo), () => {
        const at = (steps[upTo - 1] ?? pos) as [number, number];
        const shooter = unitById(this.state, shot.uid);
        if (!shooter) return leg(at, upTo);
        const def = shot.skill ? DB.skills[shot.skill] : undefined;
        const sk = shot.skill ? (skill(shot.skill) as SkillLike) : BASIC_ATTACK;
        const style = animFor(
          { id: sk.id, kind: def?.kind ?? sk.kind, shape: sk.shape, range: Math.max(2, manhattan(shooter.x, shooter.y, at[0], at[1])), radius: sk.radius, element: sk.element, anim: def?.anim, fx: def?.fx },
          { beast: shooter.classId === 'fera', weaponRange: shooter.weaponRange, wand: shooter.weaponType === 'varinha' },
        );
        const palette = paletteFor({ kind: def?.kind ?? (shooter.weaponType === 'varinha' ? 'magic' : 'physical'), element: sk.element });
        this.focus(at[0], at[1], 0.25);
        this.showBanner(shooter, `🎯 Prontidão${def ? `: ${def.name}` : '!'}`);
        this.hitPalette = palette;
        const impact = this.bfx.play(style, this.worldOf(shooter.x, shooter.y), this.worldOf(at[0], at[1]), palette[0], palette[1], sk.radius ?? 0);
        this.wait(impact, () => {
          // O dano aparece no impacto; quem morreu no tiro para ali.
          this.state.events.push(...held.splice(0));
          this.displayPos.set(u.uid, at);
          this.wait(0.6, () => {
            this.hideBanner();
            if (!u.alive) {
              this.displayPos.delete(u.uid);
              this.dyingShown.delete(u.uid);
              this.refresh();
              done();
              return;
            }
            leg(at, upTo);
          });
        });
      });
    };
    leg(from, 0);
  }

  /** Unidades já mortas no motor que continuam na tela até o tiro de prontidão chegar. */
  private dyingShown = new Set<string>();

  private animateMove(u: BattleUnit, from: [number, number], steps: [number, number][], done: () => void): void {
    if (!steps.length) {
      done();
      return;
    }
    this.anim = { uid: u.uid, points: [from, ...steps], t: 0, speed: moveSpeed(u.attrs.spd), done };
    this.lastStepSeg = -1;
    this.displayPos.set(u.uid, from);
  }

  private lastStepSeg = -1;

  private stepAnim(dt: number): void {
    const a = this.anim;
    if (!a) return;
    a.t += dt * a.speed;
    const seg = Math.floor(a.t);
    if (seg !== this.lastStepSeg) {
      this.lastStepSeg = seg;
      Audio.sfx('step');
    }
    if (seg >= a.points.length - 1) {
      this.displayPos.delete(a.uid);
      this.lift.delete(a.uid);
      this.anim = null;
      this.refresh();
      a.done();
      return;
    }
    const p0 = a.points[seg]!;
    const p1 = a.points[seg + 1]!;
    const f = a.t - seg;
    this.displayPos.set(a.uid, [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f]);
    // Pulinho a cada passo; subir ou descer degraus vira um salto suave.
    const h0 = tileAt(this.state.map, p0[0], p0[1])!.h;
    const h1 = tileAt(this.state.map, p1[0], p1[1])!.h;
    const base = f < 0.5 ? (h1 - h0) * f : (h1 - h0) * (f - 1);
    this.lift.set(a.uid, base + Math.sin(f * Math.PI) * (0.18 + Math.abs(h1 - h0) * 0.25));
    this.motion.set(a.uid, h1 !== h0 ? 'jump' : 'move');
  }

  // ───────────────────────────── encenação ─────────────────────────────

  private stepCamera(dt: number): void {
    const c = this.camTween;
    if (!c) return;
    c.t = Math.min(c.dur, c.t + dt);
    const k = c.t / c.dur;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    this.cam.panX = c.fx + (c.tx - c.fx) * e;
    this.cam.panY = c.fy + (c.ty - c.fy) * e;
    if (c.t >= c.dur) this.camTween = null;
  }

  /** Centraliza a câmera suavemente em um tile (foco no estilo XCOM). */
  private focus(x: number, y: number, dur = 0.4): void {
    const map = this.state.map;
    const t = tileAt(map, Math.round(x), Math.round(y));
    if (!t) return;
    const [sx, sy] = this.cam.project(map, x, y, t.h);
    const tx = this.cam.panX + (this.cam.viewW / 2 - sx);
    const ty = this.cam.panY + (this.cam.viewH / 2 - sy) + 10 * this.cam.zoom;
    if (Math.hypot(tx - this.cam.panX, ty - this.cam.panY) < 4) return;
    this.camTween = { fx: this.cam.panX, fy: this.cam.panY, tx, ty, t: 0, dur };
  }

  private worldOf(x: number, y: number): WorldPt {
    return [x, y, tileAt(this.state.map, x, y)?.h ?? 0];
  }

  private stepTravel(): void {
    const tr = this.travel;
    if (!tr) return;
    const k = Math.min(1, (this.time - tr.start) / tr.dur);
    this.displayPos.set(tr.uid, [tr.from[0] + (tr.to[0] - tr.from[0]) * k, tr.from[1] + (tr.to[1] - tr.from[1]) * k]);
    if (tr.leap) this.lift.set(tr.uid, Math.sin(k * Math.PI) * 2.2);
    this.motion.set(tr.uid, tr.leap ? 'jump' : 'move');
  }

  /** Encena uma habilidade (ou o ataque básico) com a animação adequada. */
  private performSkill(u: BattleUnit, sk: SkillLike, x: number, y: number, resolve: () => void, done: () => void, title = sk.name): void {
    const def = DB.skills[sk.id];
    const style = animFor(
      { id: sk.id, kind: def?.kind ?? sk.kind, shape: sk.shape, range: skillRange(u, sk), radius: sk.radius, element: sk.element, anim: def?.anim, fx: def?.fx },
      { beast: u.classId === 'fera', weaponRange: u.weaponRange, wand: u.weaponType === 'varinha' },
    );
    const magicBasic = sk.id === BASIC_ATTACK.id && u.weaponType === 'varinha';
    const palette = paletteFor({ kind: magicBasic ? 'magic' : def?.kind ?? sk.kind, element: sk.element });
    this.perform(u, title, style, palette, x, y, sk.radius ?? 0, resolve, done, sk.id);
  }

  /**
   * Encena uma ação: foco da câmera no autor, nome na tela, preparação (energia ou avanço),
   * o efeito viajando até o alvo e, no impacto, a resolução de verdade pelo motor.
   */
  private perform(u: BattleUnit, title: string, style: AnimStyle, palette: [string, string], tx: number, ty: number, radius: number, resolve: () => void, done: () => void, skill?: string): void {
    const visible = visibleToPlayer(this.state, u, this.vision);
    if (skill) this.acting.set(u.uid, { skill, magic: isMagicStyle(style) });
    const from = this.worldOf(u.x, u.y);
    const to = this.worldOf(tx, ty);
    const self = tx === u.x && ty === u.y;
    if (visible) {
      this.focus(u.x, u.y);
      this.showBanner(u, title);
    }
    const magic = isMagicStyle(style);
    this.wait(visible ? 0.45 : 0.1, () => {
      if (visible && magic && !self) this.bfx.play('charge', from, from, palette[0], palette[1]);
      else if (visible && !self && style !== 'dash' && style !== 'leap') this.lunges.set(u.uid, { dx: Math.sign(tx - u.x), dy: Math.sign(ty - u.y), start: this.time });
      this.wait(visible ? (magic && !self ? 0.4 : 0.16) : 0, () => {
        if (manhattan(u.x, u.y, tx, ty) > 3) this.focus((u.x + tx) / 2, (u.y + ty) / 2, 0.3);
        const impact = this.bfx.play(style, visible ? from : to, to, palette[0], palette[1], radius);
        if ((style === 'dash' || style === 'leap') && visible && !self) {
          const k = Math.max(0, 1 - 0.9 / Math.max(1, manhattan(u.x, u.y, tx, ty)));
          this.travel = { uid: u.uid, from: [u.x, u.y], to: [u.x + (tx - u.x) * k, u.y + (ty - u.y) * k], start: this.time, dur: impact, leap: style === 'leap' };
        }
        this.hitPalette = palette;
        this.wait(impact, () => {
          const l = this.lunges.get(u.uid);
          if (l) l.end = this.time;
          if (this.travel?.uid === u.uid) {
            this.travel = null;
            this.displayPos.delete(u.uid);
            this.lift.delete(u.uid);
          }
          this.guarded(resolve, () => {
            this.refresh();
            this.wait(0.6, () => {
              this.acting.delete(u.uid);
              this.hideBanner();
              done();
            });
          });
        });
      });
    });
  }

  private poseOf(u: BattleUnit): UnitPose {
    const hurt = this.hurtAt.get(u.uid);
    const p = resolvePose(u, { acting: this.acting.get(u.uid), hurtAge: hurt === undefined ? undefined : this.time - hurt, motion: this.motion.get(u.uid) });
    if (p.pose === 'hurt') p.key = hurt;
    return p;
  }

  private hitPalette: [string, string] = ELEMENT_PALETTE.fisico;
  private tooltip!: HTMLDivElement;
  private frameDt = 1 / 60;
  /** Movimento que ainda pode ser desfeito neste turno. */
  private undoMove: { uid: string; snap: BattleSnapshot } | null = null;

  private visibleEnemyIds(): string {
    const vision = teamVision(this.state, 'player');
    return this.state.units.filter((o) => o.team === 'enemy' && o.alive && visibleToPlayer(this.state, o, vision)).map((o) => o.uid).join(',');
  }

  private doUndoMove(u: BattleUnit): void {
    const um = this.undoMove;
    if (!um || um.uid !== u.uid || this.state.turn.acted) return;
    restoreBattle(this.state, um.snap);
    this.undoMove = null;
    this.displayPos.delete(u.uid);
    this.lift.delete(u.uid);
    this.focus(u.x, u.y);
    this.refresh();
    this.setMode({ kind: 'menu' });
  }
  /** Barras de ação do painel superior (atualizadas a cada quadro, sem refazer o painel). */
  private bars = new Map<string, { fill: HTMLElement; hp: HTMLElement; chip: HTMLElement }>();

  private updateBars(): void {
    for (const [uid, b] of this.bars) {
      const u = unitById(this.state, uid);
      if (!u) continue;
      b.fill.style.width = `${Math.max(0, Math.min(100, u.gauge))}%`;
      b.fill.classList.toggle('full', u.gauge >= 99.9 || this.state.activeUid === uid);
      b.hp.style.width = `${Math.max(0, (u.hp / u.maxHp) * 100)}%`;
      b.chip.classList.toggle('now', this.state.activeUid === uid);
      b.chip.classList.toggle('dead', !u.alive);
    }
  }

  /**
   * Roda uma chamada do motor; se uma reação de um personagem do jogador disparar, a ação é desfeita,
   * a janela "usar ou não" aparece e a ação é repetida com a resposta (o resultado até ali é o mesmo).
   */
  private guarded(fn: () => void, then: () => void): void {
    const q = runWithReactions(this.state, 'player', this.decisions, fn);
    if (!q) {
      this.decisions.clear();
      then();
      return;
    }
    this.askReaction(q, (yes) => {
      this.decisions.set(reactionKey(q), yes);
      this.guarded(fn, then);
    });
  }

  private askReaction(q: ReactionQuestion, answer: (yes: boolean) => void): void {
    const u = unitById(this.state, q.unitUid)!;
    const a = unitById(this.state, q.attackerUid);
    const sk = DB.skills[q.skillId]!;
    this.prompting = true;
    this.focus(u.x, u.y);
    Audio.sfx('turn');
    const done = (yes: boolean) => {
      this.prompting = false;
      answer(yes);
    };
    const who = a && visibleToPlayer(this.state, a, this.vision) ? a.name : 'Um inimigo oculto';
    modal(
      `⟲ Reação — ${u.name}`,
      (body, self) => {
        body.append(
          h('p', { text: `${who} ataca ${u.name}. Usar ${sk.name}?` }),
          h('div', { class: 'muted', text: sk.description }),
          h('p', { class: 'gold', text: 'Uso único: depois de usada, a reação fica gasta até o fim da batalha.' }),
          h('div', { class: 'row', style: 'justify-content:flex-end;gap:8px' },
            btn('Não usar', () => {
              self.close();
              done(false);
            }),
            btn(`⟲ Usar ${sk.name}`, () => {
              self.close();
              done(true);
            }, { class: 'primary' }),
          ),
        );
      },
      { closable: false },
    );
  }

  private showBanner(u: BattleUnit, title: string): void {
    const el = this.hud.banner!;
    clear(el);
    el.append(h('div', { class: 'who', text: u.name, style: `color:${u.team === 'player' ? '#81d4fa' : '#ef9a9a'}` }), h('div', { class: 'what', text: title }));
    el.classList.add('show');
  }

  private hideBanner(): void {
    this.hud.banner?.classList.remove('show');
  }

  /** Avisos de ambiente e de estados novos que sobem acima dos tiles. */
  private collectNotices(): void {
    const notes = diffNotices(this.state, this.snap);
    this.snap = snapshot(this.state);
    for (const n of notes) {
      if (n.uid) {
        const u = unitById(this.state, n.uid);
        if (!u || !visibleToPlayer(this.state, u, this.vision)) continue;
      } else if (!this.state.revealAll && !this.vision.has(idx(this.state.map, n.x, n.y))) continue;
      this.floaters.push({ x: n.x, y: n.y, h: 0, text: n.text, color: n.color, age: -0.25 - n.order * 0.4, life: 1.7, notice: true });
    }
  }

  private fxSoundPlayed = new Set<string>();

  private drainEvents(): void {
    this.fxSoundPlayed.clear();
    for (const e of this.state.events.splice(0)) {
      if (e.type === 'fx') {
        if (e.element !== 'hit' && !this.fxSoundPlayed.has(e.element)) {
          this.fxSoundPlayed.add(e.element);
          Audio.sfx(e.element as Sfx);
        }
        this.fx.push({ x: e.x, y: e.y, color: ELEMENT_COLOR[e.element] ?? '#fff', age: 0 });
        continue;
      }
      if (e.type === 'text') {
        this.floaters.push({ x: e.x, y: e.y, h: 0, text: e.text, color: e.color, age: 0 });
        continue;
      }
      const u = unitById(this.state, e.uid);
      if (!u) continue;
      if (e.type === 'spotted') {
        Audio.sfx('crit');
        this.floaters.push({ x: u.x, y: u.y, h: 0, text: '!', color: '#ff3d3d', age: 0, life: 1.4, alert: true });
        continue;
      }
      const push = (text: string, color: string) => this.floaters.push({ x: u.x, y: u.y, h: 0, text, color, age: 0 });
      if (e.type === 'damage') {
        this.hurtAt.set(u.uid, this.time);
        Audio.sfx(e.crit ? 'crit' : 'hit');
        if (visibleToPlayer(this.state, u, this.vision)) this.bfx.hit(this.worldOf(u.x, u.y), this.hitPalette[0], this.hitPalette[1], e.crit);
      }
      else if (e.type === 'heal') Audio.sfx('heal');
      else if (e.type === 'miss') Audio.sfx('miss');
      else if (e.type === 'death') Audio.sfx('death');
      if (e.type === 'damage') push(`-${e.amount}${e.crit ? '!' : ''}`, e.crit ? '#ffeb3b' : '#ff6b6b');
      else if (e.type === 'heal') push(`+${e.amount}${e.mp ? ' MP' : ''}`, e.mp ? '#64b5f6' : '#81c784');
      else if (e.type === 'miss') push('Errou', '#e0e0e0');
      else if (e.type === 'death') push('☠', '#ffffff');
    }
  }

  // ───────────────────────────── entrada ─────────────────────────────

  private onClick(): void {
    if (this.mode.kind === 'deploy' && this.hover) {
      const m = this.mode;
      const [x, y] = this.hover;
      const there = unitAt(this.state, x, y);
      if (there && there.team === 'player' && (!m.selected || there.uid === m.selected)) {
        this.setMode({ ...m, selected: there.uid });
        return;
      }
      const sel = m.selected ? unitById(this.state, m.selected) : undefined;
      if (sel && deployUnit(this.state, sel, x, y)) {
        Audio.sfx('step');
        this.setMode({ ...m, selected: null });
        this.refresh();
      } else if (there && there.team === 'player') this.setMode({ ...m, selected: there.uid });
      return;
    }
    const u = activeUnit(this.state);
    if (!this.hover || !u || u.team !== 'player' || this.anim) return;
    const [x, y] = this.hover;
    const i = idx(this.state.map, x, y);
    const m = this.mode;
    if (m.kind === 'move' && m.tiles.has(i)) {
      const from: [number, number] = [u.x, u.y];
      this.setMode({ kind: 'busy' });
      let steps: [number, number][] = [];
      // Retrato para "desfazer movimento" (clique errado não pune), válido só se nada aconteceu no caminho.
      const snap = snapshotBattle(this.state);
      const seenBefore = this.visibleEnemyIds();
      const logBefore = this.state.log.length;
      this.guarded(
        () => (steps = moveUnit(this.state, u, x, y)),
        () => {
          const calm = this.state.log.length === logBefore && this.visibleEnemyIds() === seenBefore && u.alive;
          this.undoMove = calm ? { uid: u.uid, snap } : null;
          this.moveWithShots(u, from, steps, () => this.afterPlayerStep(u, false));
        },
      );
    } else if (m.kind === 'target' && m.tiles.has(i)) {
      this.setMode({ kind: 'busy' });
      const done = () => this.afterPlayerStep(u, true);
      if (m.attack) this.performSkill(u, BASIC_ATTACK, x, y, () => attack(this.state, u, x, y), done);
      else if (m.itemSlot !== undefined) {
        const slot = m.itemSlot;
        const it = item(u.items[slot]!);
        const use = it.use ?? {};
        const style: AnimStyle = use.heal || use.mp ? 'heal' : use.smoke ? 'smoke' : 'orb';
        const palette = use.heal || use.mp ? ELEMENT_PALETTE.cura : use.throwElement ? ELEMENT_PALETTE[use.throwElement] : ELEMENT_PALETTE.fisico;
        this.perform(u, it.name, style, palette, x, y, use.radius ?? 0, () => useItem(this.state, u, slot, x, y), done);
      } else if (m.skill) {
        const sk = m.skill;
        const combo = m.combo;
        if (combo) Audio.sfx('combo');
        this.performSkill(u, sk, x, y, () => {
          const from: [number, number] = [u.x, u.y];
          castSkill(this.state, u, sk, x, y, combo);
          if (sk.shape === 'line' && (u.x !== from[0] || u.y !== from[1])) this.displayPos.delete(u.uid);
        }, done, combo ? `⚡ ${sk.name}` : sk.name);
      }
    }
  }

  private afterPlayerStep(u: BattleUnit, acted: boolean): void {
    this.refresh();
    if (this.state.outcome) return;
    // Agir não encerra o turno: com movimento sobrando, o menu volta para andar o resto.
    const canStillMove = u.alive && activeUnit(this.state) === u && moveTargets(this.state, u).length > 0;
    if (!u.alive || (acted && !canStillMove)) {
      this.wait(0.55, () =>
        this.guarded(
          () => {
            if (activeUnit(this.state) === u) endTurn(this.state);
          },
          () => {
            this.hudFor = null;
            this.refresh();
          },
        ),
      );
    } else this.setMode({ kind: 'menu' });
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.renderActions();
  }

  // ───────────────────────────── UI ─────────────────────────────

  private buildUi(): void {
    this.ui = layer('battle-ui');
    this.hud.top = h('div', { class: 'panel', style: 'top:6px;left:50%;transform:translateX(-50%);max-width:80vw' });
    this.hud.card = h('div', { class: 'panel', style: 'left:8px;bottom:8px;width:250px' });
    this.hud.actions = h('div', { class: 'panel', style: 'left:50%;bottom:8px;transform:translateX(-50%);max-width:640px' });
    this.hud.log = h('div', { class: 'panel battle-log', style: 'right:8px;top:90px;width:270px;font-size:12px' });
    loadLogLayout(this.hud.log);
    this.tooltip = h('div', { class: 'skill-tip' });
    document.body.append(this.tooltip);
    this.hud.info = h('div', { class: 'panel', style: 'right:8px;top:360px;width:260px;display:none;font-size:12px' });
    this.hud.help = h('div', {
      class: 'panel muted',
      style: 'left:8px;top:8px;font-size:11px;max-width:230px',
      text: 'Q/E girar câmera · roda: zoom · botão direito arrastando: mover câmera · Esc: cancelar',
    });
    this.hud.banner = h('div', { class: 'action-banner' });
    this.ui.append(this.hud.top, this.hud.card, this.hud.actions, this.hud.log, this.hud.info, this.hud.help, this.hud.banner);
  }

  private refresh(): void {
    this.vision = teamVision(this.state, 'player');
    this.renderTop();
    this.renderCard();
    this.renderActions();
    this.renderLog();
  }

  /** Painel superior: heróis e inimigos em posição fixa, cada um com vida e barra de ação; clicar foca nele. */
  private renderTop(): void {
    const el = this.hud.top!;
    clear(el);
    this.bars.clear();
    const chip = (u: BattleUnit) => {
      const visible = visibleToPlayer(this.state, u, this.vision) || !u.alive;
      const fill = h('div', { class: 'atb-fill' });
      const hp = h('div', { class: 'atb-hp-fill' });
      const c = h(
        'div',
        { class: `chip ${u.team}`, title: visible ? `${u.name} — ${DB.classes[u.classId].name}` : 'Inimigo oculto', style: 'cursor:pointer', onClick: () => visible && u.alive && this.focus(u.x, u.y) },
        visible ? portraitCanvas(unitSpec(u)) : h('span', { class: 'portrait unknown', text: '?' }),
        h('b', { text: visible ? u.name.split(' ')[0]!.slice(0, 9) : '???' }),
        h('div', { class: 'atb-hp' }, hp),
        h('div', { class: 'atb' }, fill),
      );
      this.bars.set(u.uid, { fill, hp, chip: c });
      return c;
    };
    const side = (team: 'player' | 'enemy') => h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:3px' }, ...this.state.units.filter((u) => u.team === team && (u.alive || !u.summonedBy)).map(chip));
    const v = this.state.victory;
    const goal = VICTORY_LABEL[v.type] + (v.type === 'survive' ? ` (${v.rounds})` : '');
    el.append(
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'gold', text: `🎯 ${goal}` }), h('span', { class: 'muted', text: `Rodada ${this.state.round}` })),
      h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:10px;align-items:flex-start' }, side('player'), h('span', { class: 'muted', style: 'align-self:center', text: 'vs' }), side('enemy')),
    );
    this.updateBars();
  }

  private renderCard(): void {
    const el = this.hud.card!;
    clear(el);
    const u = activeUnit(this.state);
    if (!u) {
      el.append(h('div', { class: 'muted', text: 'Aguardando a próxima barra de ação…' }));
      return;
    }
    const visible = visibleToPlayer(this.state, u, this.vision);
    if (!visible) {
      el.append(h('div', { class: 'muted', text: 'Um inimigo oculto está agindo…' }));
      return;
    }
    el.append(unitCard(u));
  }

  /** Registro: minimizável, arrastável e com os nomes das habilidades explicados ao passar o mouse. */
  private renderLog(): void {
    const el = this.hud.log!;
    clear(el);
    const collapsed = el.dataset.collapsed === '1';
    const toggle = h('button', { class: 'small', text: collapsed ? '▸' : '▾', title: collapsed ? 'Abrir' : 'Minimizar' });
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      el.dataset.collapsed = collapsed ? '0' : '1';
      saveLogLayout(el);
      this.renderLog();
    });
    const head = h('div', { class: 'log-head' }, h('h3', { text: 'Registro', style: 'margin:0' }), toggle);
    makeDraggable(el, head);
    el.append(head);
    if (collapsed) return;
    const body = h('div', { class: 'log-body' });
    const links = skillNameIndex(this.state.units);
    for (const line of this.state.log.slice(-30).reverse()) body.append(linkify(line, links, this.tooltip));
    el.append(body);
  }

  private renderActions(): void {
    const el = this.hud.actions!;
    if (!el) return;
    clear(el);
    const u = activeUnit(this.state);
    const m = this.mode;
    if ((!u || u.team !== 'player' || this.state.outcome) && m.kind !== 'deploy') {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    if (m.kind === 'deploy') {
      const sel = m.selected ? unitById(this.state, m.selected) : undefined;
      el.style.display = '';
      el.append(
        h('span', { class: 'gold', text: sel ? `Formação: escolha a casa verde para ${sel.name} (outro herói troca de lugar)` : 'Formação: clique num herói e depois numa casa verde' }),
        btn('⚔ Iniciar batalha', () => this.endDeploy(), { class: 'primary' }),
      );
      return;
    }
    if (m.kind === 'busy') {
      el.append(h('span', { class: 'muted', text: '…' }));
      return;
    }
    if (m.kind === 'move' || m.kind === 'target') {
      el.append(
        h('span', { class: 'gold', text: m.kind === 'move' ? 'Escolha o destino (o caminho previsto aparece ao passar o mouse)' : m.label }),
        btn('Cancelar (Esc)', () => this.setMode({ kind: 'menu' })),
      );
      return;
    }
    if (!u) return;
    const s = this.state;
    const acted = s.turn.acted;
    // Movimento que ainda sobra no turno (0 se não há para onde ir).
    const moveLeft = moveTargets(s, u).length ? Math.min(moveBudget(u), s.turn.moveLeft ?? moveBudget(u)) : 0;
    const row = h('div', { class: 'row' });
    row.append(
      ...(s.turn.moved && !s.turn.acted && this.undoMove?.uid === u.uid ? [btn('↩ Desfazer movimento', () => this.doUndoMove(u))] : []),
      btn(`🥾 Mover (${moveLeft} m)`, () => this.startMove(u), { disabled: moveLeft <= 0 }),
      btn('⚔ Atacar', () => this.startAttack(u), { disabled: acted || !canStrike(u) }),
      btn('✨ Habilidades', () => this.openSkills(u), { disabled: acted || (!u.skills.length && !comboOptions(s, u).length) }),
      btn('🎒 Itens', () => this.openItems(u), { disabled: acted || !u.items.some(Boolean) || !!u.statuses.sem_itens }),
      btn('🛡 Defender', () => this.selfAction(u, 'Defender', 'buff', () => defend(s, u)), { disabled: acted }),
      btn(`🌑 Esconder (${hideChance(s, u)}%)`, () => this.selfAction(u, 'Esconder', 'smoke', () => hide(s, u)), { disabled: acted || u.hidden }),
      btn('🎯 Prontidão', () => this.openOverwatch(u), { disabled: acted || u.weaponRange < 1 }),
      btn(acted ? '⏭ Encerrar turno' : '⏭ Esperar (barra 50%)', () => {
        this.setMode({ kind: 'busy' });
        this.guarded(
          () => endTurn(s),
          () => {
            this.hudFor = null;
            this.refresh();
          },
        );
      }),
    );
    if (s.canFlee)
      row.append(
        btn(`🏃 Fugir (${fleeChance(s)}%)`, () => {
          flee(s, u);
          if (!s.outcome) this.afterPlayerStep(u, true);
          else this.refresh();
        }, { class: 'danger' }),
      );
    el.append(row);
  }

  /** Linha de tiro até o tile sob o cursor, com o obstáculo que a bloqueia (só ataques à distância com mira). */
  private fireLineFor(u: BattleUnit | undefined, m: Mode): { from: [number, number]; to: [number, number]; blocked?: [number, number] } | undefined {
    if (!u || !this.hover || m.kind !== 'target' || !m.skill) return undefined;
    const [x, y] = this.hover;
    const i = idx(this.state.map, x, y);
    const sk = m.skill;
    const fxd = DB.skills[sk.id]?.fx;
    if (sk.target === 'self' || fxd?.homing || fxd?.teleport || (!m.range.has(i) && !m.tiles.has(i)) || manhattan(u.x, u.y, x, y) <= 1) return undefined;
    const block = losBlocker(this.state.map, u.x, u.y, x, y);
    return { from: [u.x, u.y], to: [x, y], blocked: block && !m.tiles.has(i) ? [block.x, block.y] : undefined };
  }

  private selfAction(u: BattleUnit, title: string, style: AnimStyle, resolve: () => void): void {
    this.setMode({ kind: 'busy' });
    // Ação livre (ex.: esconder-se do Ladino) devolve o menu em vez de encerrar o turno.
    this.perform(u, title, style, ELEMENT_PALETTE.apoio, u.x, u.y, 0, resolve, () => this.afterPlayerStep(u, this.state.turn.acted));
  }

  /** Alcance bruto (losango em volta de quem age), mostrado fraco por baixo dos alvos válidos. */
  private rangeOf(u: BattleUnit, sk: SkillLike | undefined, maxRange?: number): Set<number> {
    const out = new Set<number>();
    const r = maxRange ?? (sk ? skillRange(u, sk) : 0);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = u.x + dx;
        const y = u.y + dy;
        if (Math.abs(dx) + Math.abs(dy) > r || !inBounds(this.state.map, x, y)) continue;
        out.add(idx(this.state.map, x, y));
      }
    return out;
  }

  private startMove(u: BattleUnit): void {
    const reach = reachable(this.state, u);
    this.setMode({ kind: 'move', reach, tiles: new Set(moveTargets(this.state, u, reach)) });
  }

  private startAttack(u: BattleUnit): void {
    const tiles = new Set(skillTargets(this.state, u, BASIC_ATTACK, this.vision));
    this.setMode({ kind: 'target', label: 'Atacar: escolha um inimigo ao alcance', tiles, range: this.rangeOf(u, BASIC_ATTACK), attack: true, skill: BASIC_ATTACK });
  }

  /** Prontidão com a arma ou com uma habilidade preparada (o MP é pago agora; se ninguém vier, se perde). */
  private openOverwatch(u: BattleUnit): void {
    const s = this.state;
    const ready = (skillId?: string, title = 'Prontidão') => this.selfAction(u, title, 'charge', () => setOverwatch(s, u, skillId));
    const options = u.skills.map((id) => skill(id) as SkillLike).filter((sk) => readyable(sk));
    if (!options.length) {
      ready();
      return;
    }
    modal(`Prontidão — ${u.name} (MP ${u.mp}/${u.maxMp})`, (body, self) => {
      body.append(
        h('div', { class: 'muted', text: 'Atira no primeiro inimigo que se mover dentro do alcance, antes do seu próximo turno.' }),
        h(
          'div',
          { class: 'item row', style: 'justify-content:space-between' },
          h('div', {}, h('b', { text: '🎯 Arma' }), h('span', { class: 'muted', text: ` · alcance ${u.weaponRange} · sem custo` })),
          btn('Preparar', () => {
            self.close();
            ready();
          }),
        ),
      );
      for (const sk of options) {
        body.append(
          h(
            'div',
            { class: 'item row', style: 'justify-content:space-between' },
            h(
              'div',
              {},
              h('b', { text: sk.name }),
              h('span', { class: 'muted', text: ` · ${mpCost(u, sk)} MP · alcance ${skillRange(u, sk)}${sk.radius ? ` · raio ${sk.radius}` : ''}` }),
              h('div', { class: 'muted', text: 'O MP é gasto agora; se ninguém entrar no alcance até o seu próximo turno, a magia se desfaz.' }),
            ),
            btn('Preparar', () => {
              self.close();
              ready(sk.id, `Prontidão: ${sk.name}`);
            }, { disabled: !skillUsable(s, u, sk) }),
          ),
        );
      }
    });
  }

  private openSkills(u: BattleUnit): void {
    const s = this.state;
    const mm = modal(`Habilidades — ${u.name} (MP ${u.mp}/${u.maxMp})`, (body, self) => {
      for (const id of u.skills) {
        if (skill(id).passive) continue;
        const sk = skill(id) as SkillLike;
        body.append(
          h(
            'div',
            { class: 'item row', style: 'justify-content:space-between' },
            h('div', {}, h('b', { text: sk.name }), h('span', { class: 'muted', text: ` · ${mpCost(u, sk)} MP${sk.element ? ` · ${sk.element}` : ''}${u.cooldowns[id] ? ` · recarga ${u.cooldowns[id]}` : ''}` }), h('div', { class: 'muted', text: skill(id).description })),
            btn('Usar', () => {
              self.close();
              this.setMode({ kind: 'target', label: `${sk.name}: escolha o alvo`, tiles: new Set(skillTargets(s, u, sk, this.vision)), range: this.rangeOf(u, sk), skill: sk });
            }, { disabled: !skillUsable(s, u, sk) }),
          ),
        );
      }
      const combos = comboOptions(s, u);
      if (combos.length) body.append(h('h3', { class: 'gold', text: '⚡ Combos disponíveis' }));
      for (const c of combos) {
        const sk = comboAsSkill(c);
        body.append(
          h(
            'div',
            { class: 'item row', style: 'justify-content:space-between' },
            h('div', {}, h('b', { text: `${c.combo.name}` }), h('span', { class: 'muted', text: ` com ${c.partner.name} · ${skill(c.mySkill).name} + ${skill(c.partnerSkill).name}` }), h('div', { class: 'muted', text: c.combo.description + ' A barra do parceiro também zera.' })),
            btn('Combar', () => {
              self.close();
              this.setMode({ kind: 'target', label: `⚡ ${c.combo.name}: escolha o alvo`, tiles: new Set(skillTargets(s, u, sk, this.vision)), range: this.rangeOf(u, sk), skill: sk, combo: c });
            }),
          ),
        );
      }
    });
    void mm;
  }

  private openItems(u: BattleUnit): void {
    modal(`Itens de campo — ${u.name}`, (body, self) => {
      u.items.forEach((id, slot) => {
        if (!id) return;
        const it = item(id);
        body.append(
          h(
            'div',
            { class: 'item row', style: 'justify-content:space-between' },
            h('div', {}, h('b', { text: it.name }), h('div', { class: 'muted', text: it.description })),
            btn('Usar', () => {
              self.close();
              const tiles = new Set(itemTargets(this.state, u, id));
              const far = Math.max(0, ...[...tiles].map((i) => manhattan(u.x, u.y, i % this.state.map.w, Math.floor(i / this.state.map.w))));
              this.setMode({ kind: 'target', label: `${it.name}: escolha o alvo`, tiles, range: this.rangeOf(u, undefined, far), itemSlot: slot });
            }),
          ),
        );
      });
    });
  }

  private updateHoverInfo(): void {
    const el = this.hud.info!;
    if (!this.hover) {
      el.style.display = 'none';
      return;
    }
    const [x, y] = this.hover;
    const map = this.state.map;
    const t = map.tiles[idx(map, x, y)]!;
    const key = `${x},${y},${this.mode.kind},${this.mode.kind === 'target' ? this.mode.label : ''},${this.state.activeUid},${this.state.log.length}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    clear(el);
    el.style.display = '';
    const parts = [TERRAIN[t.t].name, `altura ${t.h}`];
    if (t.p) parts.push(`${PROPS[t.p].name} (${t.pHp ?? PROPS[t.p].hp}/${PROPS[t.p].hp})`);
    if (t.s) parts.push(SURFACES[t.s].name);
    if (t.c) parts.push(CLOUDS[t.c].name);
    if (t.spawn === 'extract') parts.push('zona de fuga');
    el.append(h('div', { class: 'muted', text: parts.join(' · ') }));
    const sides = coverSides(map, x, y);
    if (sides.length) {
      const full = sides.some((c) => c.level === 'full');
      el.append(h('div', { style: 'color:#4fc3f7', text: `🛡 Cobertura ${full ? 'total' : 'parcial'} contra tiros vindos de ${sides.length === 1 ? '1 lado' : `${sides.length} lados`} (flanqueado não conta)` }));
    }
    const target = unitAt(this.state, x, y);
    const u = activeUnit(this.state);
    const mm = this.mode;
    if (u && mm.kind === 'target' && mm.skill && !mm.tiles.has(idx(map, x, y)) && mm.range.has(idx(map, x, y)) && manhattan(u.x, u.y, x, y) > 1 && !DB.skills[mm.skill.id]?.fx?.homing) {
      const block = losBlocker(map, u.x, u.y, x, y);
      if (block) el.append(h('div', { style: 'color:#ff8a80', text: `🚫 Linha de tiro bloqueada: ${block.reason}${block.x === x && block.y === y ? '' : ` (tile ${block.x},${block.y})`}` }));
      else if (!target) el.append(h('div', { class: 'muted', text: 'Linha de tiro livre — escolha um alvo.' }));
    }
    if (u && t.p && !target && mm.kind === 'target' && mm.skill?.id === 'ataque' && mm.tiles.has(idx(map, x, y))) {
      const dmg = structureHit(u, u.weaponType === 'varinha' ? 'magic' : 'basic', 0);
      el.append(h('div', { class: 'gold', text: `🪓 Quebrar ${PROPS[t.p].name}: ${dmg} de dano (acerto garantido)` }));
    }
    if (target && visibleToPlayer(this.state, target, this.vision)) {
      el.append(unitCard(target));
      const m = this.mode;
      if (u && m.kind === 'target' && m.skill && m.skill.kind !== 'heal' && m.skill.kind !== 'buff' && target.team !== u.team) {
        const kind = m.skill.id === 'ataque' ? (u.weaponType === 'varinha' ? 'magic' : 'basic') : m.skill.kind;
        const p = previewHit(this.state, u, target, kind, m.skill.power, m.skill.element, m.skill.accuracy ?? 0, 1, m.skill);
        el.append(h('div', { class: 'gold', text: `Acerto ${p.chance}% · Dano ${p.min}–${p.max} · Crítico ${p.crit}%` }));
        if (p.cover !== 'none') el.append(h('div', { style: 'color:#4fc3f7', text: `🛡 Alvo em cobertura ${p.cover === 'full' ? 'total (−40%)' : 'parcial (−20%)'}` }));
      }
    }
  }

  // ───────────────────────────── render ─────────────────────────────

  protected override onRender(): void {
    const ctx = this.ctx.renderer.ctx;
    const u = activeUnit(this.state);
    const highlights = new Map<number, string>();
    let path: Set<number> | undefined;
    let area: Set<number> | undefined;
    let cover: CoverMark[] | undefined;
    let glow: Set<number> | undefined;
    let fireLine: { from: [number, number]; to: [number, number]; blocked?: [number, number] } | undefined;
    const m = this.mode;
    if (m.kind === 'deploy') {
      const pulse = Math.sin(this.time * 3);
      for (const i of m.tiles) highlights.set(i, `rgba(120,230,140,${(0.4 + pulse * 0.1).toFixed(3)})`);
      const sel = m.selected ? unitById(this.state, m.selected) : undefined;
      if (sel) highlights.set(idx(this.state.map, sel.x, sel.y), 'rgba(255,245,157,0.6)');
      glow = m.tiles;
    } else if (m.kind === 'move') {
      for (const i of m.tiles) highlights.set(i, 'rgba(80,160,255,0.35)');
      if (this.hover && u) {
        const hi = idx(this.state.map, this.hover[0], this.hover[1]);
        if (m.tiles.has(hi)) {
          path = new Set(pathTo(this.state, m.reach, hi).map(([x, y]) => idx(this.state.map, x, y)));
          const [hx, hy] = this.hover;
          cover = coverSides(this.state.map, hx, hy).map((c) => ({ x: hx, y: hy, dx: c.dx, dy: c.dy, level: c.level as CoverMark['level'] }));
        }
      }
    } else if (m.kind === 'target') {
      // Alcance com brilho que pulsa devagar (fade), para se destacar do chão.
      const pulse = Math.sin(this.time * 3);
      for (const i of m.range) highlights.set(i, `rgba(255,200,90,${(0.24 + pulse * 0.08).toFixed(3)})`);
      for (const i of m.tiles) highlights.set(i, `rgba(255,120,40,${(0.42 + pulse * 0.12).toFixed(3)})`);
      glow = m.tiles;
      fireLine = this.fireLineFor(u, m);
      if (this.hover && u && m.tiles.has(idx(this.state.map, this.hover[0], this.hover[1]))) {
        const sk = m.itemSlot !== undefined ? ({ ...BASIC_ATTACK, shape: 'radius', radius: item(u.items[m.itemSlot]!).use?.radius ?? 0, target: 'tile' } as SkillLike) : m.skill;
        if (sk) {
          const isPotion = m.itemSlot !== undefined && (item(u.items[m.itemSlot]!).use?.heal || item(u.items[m.itemSlot]!).use?.mp);
          const tiles = isPotion ? [this.hover] : areaOf(this.state, u, sk, this.hover[0], this.hover[1]);
          area = new Set(tiles.map(([x, y]) => idx(this.state.map, x, y)));
        }
      }
    }
    const cones = u?.hidden && u.team === 'player' ? opponents(this.state, u).filter((e) => visibleToPlayer(this.state, e, this.vision)) : [];
    const display = new Map(this.displayPos);
    for (const [uid, l] of this.lunges) {
      const lu = unitById(this.state, uid);
      if (!lu || display.has(uid)) continue;
      const k = Math.min(1, (this.time - l.start) / 0.12) * (l.end === undefined ? 1 : Math.max(0, 1 - (this.time - l.end) / 0.2));
      display.set(uid, [lu.x + l.dx * 0.32 * k, lu.y + l.dy * 0.32 * k]);
    }
    ctx.save();
    if (this.bfx.shake > 0) ctx.translate((Math.random() - 0.5) * this.bfx.shake, (Math.random() - 0.5) * this.bfx.shake);
    drawBattle(ctx, this.cam, this.state.map, {
      highlights,
      path,
      area,
      hover: this.hover,
      units: this.state.units,
      unitVisible: (x) => (x.alive || this.dyingShown.has(x.uid)) && visibleToPlayer(this.state, x, this.vision),
      displayPos: display,
      lift: this.lift,
      cover,
      glow,
      fireLine,
      pose: (x) => this.poseOf(x),
      showDead: (x) => !!artFor(x.look.art)?.clips.dead && (this.state.revealAll || this.vision.has(idx(this.state.map, x.x, x.y))),
      reaction: (x) => (x.team === 'player' || visibleToPlayer(this.state, x, this.vision) ? reactionState(x) : 'none'),
      vision: this.state.revealAll ? null : this.vision,
      activeUid: this.state.activeUid,
      cones,
      time: this.time,
      floaters: this.floaters,
      fx: this.fx,
    });
    this.bfx.draw(ctx, this.cam, this.state.map);
    ctx.restore();
    this.bfx.drawFlash(ctx, this.cam.viewW, this.cam.viewH);
  }

  // ───────────────────────────── fim ─────────────────────────────

  private showResult(): void {
    const s = this.state;
    Audio.sfx(s.outcome === 'victory' ? 'victory' : 'defeat');
    const title = s.outcome === 'victory' ? '🏆 Vitória' : s.outcome === 'fled' ? '🏃 Fuga' : '☠ Derrota';
    modal(
      title,
      (body, self) => {
        body.append(h('p', { class: 'muted', text: this.setupCtx.title }));
        for (const u of s.units.filter((x) => x.team === 'player')) {
          body.append(h('div', { class: 'row' }, h('b', { text: u.name, style: 'min-width:140px' }), u.alive ? bar(u.hp, u.maxHp, '#66bb6a') : h('span', { class: 'danger', text: 'morto' }), h('span', { class: 'muted', text: `${u.kills} abates` })));
        }
        body.append(
          h('div', { class: 'row', style: 'margin-top:10px;justify-content:flex-end' },
            btn('Continuar', () => {
              self.close();
              this.finish();
            }, { class: 'primary' }),
          ),
        );
      },
      { closable: false },
    );
  }

  private finish(): void {
    const ctxKind = this.setupCtx.kind;
    store.battleResult = ctxKind === 'encounter' || ctxKind === 'contract' ? buildResult(this.state, this.setupCtx) : null;
    this.ctx.scenes.go(this.returnTo);
  }

  private setupDev(): void {
    DevPanel.setGroups([
      {
        title: 'Batalha',
        actions: [
          { label: 'Vencer', run: () => { for (const e of this.state.units) if (e.team === 'enemy') e.alive = false; this.state.outcome = 'victory'; } },
          { label: 'Perder', run: () => { this.state.outcome = 'defeat'; } },
          { label: 'Revelar tudo', run: () => { this.state.revealAll = !this.state.revealAll; this.refresh(); } },
          { label: 'Curar esquadrão', run: () => { for (const p of this.state.units) if (p.team === 'player' && p.alive) { p.hp = p.maxHp; p.mp = p.maxMp; } this.refresh(); } },
          { label: 'Encher barras', run: () => { for (const p of this.state.units) if (p.team === 'player' && p.alive) p.gauge = 99.9; } },
          { label: 'Fogo no cursor', run: () => this.devElement('fogo') },
          { label: 'Água no cursor', run: () => this.devElement('agua') },
          { label: 'Raio no cursor', run: () => this.devElement('eletricidade') },
          { label: 'Gelo no cursor', run: () => this.devElement('gelo') },
        ],
      },
    ]);
  }

  private devElement(el: 'fogo' | 'agua' | 'eletricidade' | 'gelo'): void {
    const target = this.hover ?? (activeUnit(this.state) ? [activeUnit(this.state)!.x, activeUnit(this.state)!.y] as [number, number] : null);
    if (!target) return;
    applyElementToTile(this.state, target[0], target[1], el);
    this.refresh();
  }
}

// ───────────────────────────── registro ─────────────────────────────

const LOG_LAYOUT_KEY = 'jogo:registro';

function saveLogLayout(el: HTMLElement): void {
  try {
    localStorage.setItem(LOG_LAYOUT_KEY, JSON.stringify({ left: el.style.left, top: el.style.top, collapsed: el.dataset.collapsed === '1' }));
  } catch {
    /* sem armazenamento */
  }
}

function loadLogLayout(el: HTMLElement): void {
  try {
    const raw = localStorage.getItem(LOG_LAYOUT_KEY);
    if (!raw) return;
    const l = JSON.parse(raw) as { left?: string; top?: string; collapsed?: boolean };
    if (l.left && l.top) {
      el.style.left = l.left;
      el.style.top = l.top;
      el.style.right = 'auto';
    }
    el.dataset.collapsed = l.collapsed ? '1' : '0';
  } catch {
    /* sem armazenamento */
  }
}

/** Arrastar o painel pelo cabeçalho (posição lembrada entre batalhas). */
function makeDraggable(el: HTMLElement, handle: HTMLElement): void {
  handle.style.cursor = 'move';
  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    const r = el.getBoundingClientRect();
    const parent = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const move = (ev: PointerEvent) => {
      el.style.left = `${Math.max(0, ev.clientX - parent.left - dx)}px`;
      el.style.top = `${Math.max(0, ev.clientY - parent.top - dy)}px`;
      el.style.right = 'auto';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveLogLayout(el);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });
}

/** Nomes das habilidades de quem está na batalha → id (os mais longos primeiro, para casar "Bola de Fogo Maior" antes de "Bola de Fogo"). */
function skillNameIndex(units: BattleUnit[]): [string, string][] {
  const map = new Map<string, string>();
  for (const u of units) for (const id of u.skills) {
    const sk = DB.skills[id];
    if (sk && sk.name.length > 3) map.set(sk.name, id);
  }
  return [...map.entries()].sort((a, b) => b[0].length - a[0].length);
}

/** Ficha de origem (criatura ou árvore) para o resumo mecânico. */
function sourceSkill(id: string): import('../../data').CreatureSkill | undefined {
  for (const c of Object.values(DB.creatures)) {
    const s = c!.skills.find((x) => x.id === id);
    if (s) return s;
  }
  for (const t of Object.values(DB.trees)) for (const n of t!.nodes) {
    const s = n.skills.find((x) => x.id === id);
    if (s) return s;
  }
  return undefined;
}

/** Linha do registro com os nomes de habilidade sublinhados; passar o mouse mostra o que a habilidade faz. */
function linkify(line: string, names: [string, string][], tip: HTMLDivElement): HTMLElement {
  const row = h('div', {});
  let rest = line;
  while (rest.length) {
    let found: { at: number; name: string; id: string } | null = null;
    for (const [name, id] of names) {
      const at = rest.indexOf(name);
      if (at >= 0 && (!found || at < found.at)) found = { at, name, id };
    }
    if (!found) {
      row.append(rest);
      break;
    }
    if (found.at > 0) row.append(rest.slice(0, found.at));
    const link = h('span', { class: 'skill-link', text: found.name });
    const id = found.id;
    link.addEventListener('mouseenter', (e) => {
      const sk = DB.skills[id];
      const src = sourceSkill(id);
      clear(tip);
      tip.append(h('b', { text: sk?.name ?? id }), h('div', { text: sk?.description ?? '' }), src ? h('div', { class: 'muted', text: describeSkill(src) }) : '');
      tip.style.display = 'block';
      tip.style.left = `${Math.min(window.innerWidth - 300, e.clientX + 12)}px`;
      tip.style.top = `${e.clientY + 12}px`;
    });
    link.addEventListener('mouseleave', () => (tip.style.display = 'none'));
    row.append(link);
    rest = rest.slice(found.at + found.name.length);
  }
  return row;
}

export function unitCard(u: BattleUnit): HTMLElement {
  const statuses = (Object.keys(u.statuses) as StatusId[]).map((s) => `${STATUS_INFO[s].icon} ${STATUS_INFO[s].name} (${u.statuses[s]})`);
  if (u.hidden) statuses.push('🌑 Escondido');
  if (u.overwatch) statuses.push(u.overwatchSkill ? `🎯 Prontidão: ${skill(u.overwatchSkill).name}` : '🎯 Prontidão');
  if (u.defending) statuses.push('🛡 Defendendo');
  if (u.shield) statuses.push(`🛡 Escudo ${u.shield}`);
  const react = reactionState(u);
  if (react !== 'none') statuses.push(react === 'ready' ? '◆ Reação pronta' : '◇ Reação gasta');
  const beastSkills = u.classId === 'fera' ? u.skills.map((id) => DB.skills[id]).filter((s) => !!s) : [];
  return h(
    'div',
    { class: 'col' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: u.name, style: `color:${u.team === 'player' ? '#4fc3f7' : '#ef5350'}` }), h('span', { class: 'muted', text: `${DB.classes[u.classId].name} · Nv ${u.level}` })),
    bar(u.hp, u.maxHp, '#66bb6a', `HP ${u.hp}/${u.maxHp}`),
    u.maxMp ? bar(u.mp, u.maxMp, '#42a5f5', `MP ${u.mp}/${u.maxMp}`) : null,
    bar(Math.min(100, u.gauge), 100, '#fdd835', `Barra ${Math.floor(Math.min(100, u.gauge))}%`),
    h('div', { class: 'muted', style: 'font-size:11px', text: `FOR ${u.attrs.str} DES ${u.attrs.dex} VEL ${u.attrs.spd} INT ${u.attrs.int} VIT ${u.attrs.vit} · Mov ${u.move} · ${actionInterval(u.attrs.spd).toFixed(1)} s/ação` }),
    statuses.length ? h('div', { style: 'font-size:11px', text: statuses.join(' · ') }) : null,
    beastSkills.length
      ? h('div', { class: 'muted', style: 'font-size:11px', text: beastSkills.map((s) => `${s!.passive ? '◇' : '◆'} ${s!.name}${u.cooldowns[s!.id] ? ` (${u.cooldowns[s!.id]})` : ''}`).join(' · ') })
      : null,
  );
}

void xy;
