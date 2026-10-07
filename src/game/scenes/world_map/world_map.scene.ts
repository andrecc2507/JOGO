import { Scene } from '@core';
import { buildLabel } from '../../rules/skill_tree';
import { btn, clear, h, layer, modal, modalOpen, toast } from '@ui/dom';
import { closeMenu, openMenu, type MenuEntry } from '@ui/menu';
import { DB, type Rarity } from '../../data';
import { DevPanel } from '../../dev/dev_panel';
import { Audio } from '../../audio/audio';
import { devCharacters } from '../../dev/dev_squad';
import { regionLabel } from '../../world/regions';
import { openWarRoom } from './war_room';
import { openSoldiers, pendingPoints } from './soldiers_screen';
import { openEvolve } from '../shared/evolve_screen';
import { GOAL_LABEL, forceIcon, forceLabel, forceVisible, forcesAt, removeForce, type Force } from '../../world/forces';
import { interceptTarget } from '../../world/commander';
import { reactTo } from '../../world/politics';
import { OWNER_LABEL, estimate, provinceState } from '../../world/territory';
import { SUPPLY, buyRations, dailyRations, isTired, supplyCap } from '../../world/logistics';
import CMD from '../../data/world/commander.json';
import { applyWeather, seasonLabel, weatherIn } from '../../world/season';
import { campRest, dungeonAfterBattle, dungeonClosed, dungeonInfo, dungeonSetup, dungeonState, isDungeonNode, leaveDungeon } from '../../world/dungeon';
import { ensureExpedition } from '../../world/expedition';
import { OUTPOST_KINDS, buildBlock, buildOutpost, outpostAt, runeDestinations, runeJump, type OutpostKind } from '../../world/outposts';
import { CAPTAIN_SKILLS, captainOf, setCaptain, type CaptainSkill } from '../../world/captains';
import { canAfford, choiceChance, resolveChoice, rollTravelEvent, traitHelps, type TravelEvent } from '../../world/travel_events';
import { actsBattleMods, actsMissionBlock } from '../../world/acts';
import { canCross, crossVoid, inVoid } from '../../world/act_void';
import { campBlock, setCamp } from '../../world/act_camp';
import { crownSpare } from '../../world/act_crown';

const CMD_PREP = CMD.prep;
import { CanvasPointer } from '../../render/pointer';
import { WorldCamera, drawWorld, minimapHit, nodeVisible, squadScreenPos } from '../../render/world_renderer';
import { canSpendAttr, fullHeal, gainXp, xpToNext } from '../../rules/character';
import { autosave, loadGame, saveGame, store } from '../../state/store';
import {
  SPEEDS,
  SPEED_LABEL,
  SQUAD_COLORS,
  SQUAD_ICONS,
  addLog,
  allContracts,
  infirmaryAt,
  travelers,
  advanceAct,
  advanceHours,
  atBase,
  campaignRng,
  contractReadyAt,
  createSquad,
  dateLabel,
  fitMembers,
  members,
  orderMove,
  seaFee,
  refreshRecruits,
  setResting,
  squadById,
  squadPosition,
  stopSquad,
  type Campaign,
  type CampaignEvent,
  type Squad,
} from '../../world/campaign';
import { applyBattleResult, canAmbush, contractSetup, encounterSetup, forceSetup, negotiateChance, planEncounter, rollEncounter, squadLevel, type Approach } from '../../world/encounters';
import { CITADEL_ID, capitals, countryOf, node, worldGraph, type NodeType } from '../../world/layout';
import { openBarracks } from './barracks_screen';
import { openCapital, type CapitalTab } from './capital_screen';
import { openKnownBestiary } from './known_bestiary';
import { SERVICE_LABEL, capitalService } from '../../world/capital_services';
import { openBase, openHideoutChoice, type BaseTab } from './base_screen';
import { veilActive } from '../../world/veil';
import INTRO from '../../data/story/intro.json';
import { CHAPTER_TITLE, EPILOGUE_LINES, STORY, WORLDS, endingOf, fallenCapitals, hasFlag, setFlag, type StoryLine, availableMissions, ensureStory, markSeen, mission, missionNode, missionsAt, type StoryMission } from '../../world/story';
import { finishMission, missionLevel, storySetup, type MissionOutcome } from '../../world/story_battle';
import { ensureStats, statsLines } from '../../world/telemetry';
import { playDialogue } from '../shared/story_dialog';
import { openJournal } from './journal_screen';
import { openOptions } from '../shared/options_screen';
import { t } from '../../i18n/i18n';
import { openGlossary } from '../shared/glossary_screen';
import { availableConversations, finishConversation } from '../../world/camp';
import { HINTS, featureUnlocked, lockedReason, mapHints, takeNewUnlocks, type Feature } from '../../world/tutorial';
import { markHint, settings } from '../../state/settings';
import { openLoad, openSaveAs } from '../shared/saves_screen';
import { difficultyLabel } from '../../world/difficulty';

/** Nome de um local para textos (estrada vira "estrada"). */
function placeName(id: string): string {
  const n = node(id);
  return n.type === 'waypoint' ? 'estrada' : n.id === CITADEL_ID ? 'Citadela Real' : n.name;
}

const NODE_TYPE_LABEL: Record<NodeType, string> = { citadel: 'Citadela', capital: 'Capital', city: 'Cidade (ponto de descanso)', waypoint: 'Estrada', village: 'Vila de fronteira (estalagem)', lair: 'Covil', dungeon: 'Masmorra' };

export class WorldMapScene extends Scene {
  readonly id = 'world_map';
  protected override readonly systems = ['debug_overlay'];

  private c!: Campaign;
  private cam = new WorldCamera(960, 540);
  private pointer!: CanvasPointer;
  private ui!: HTMLDivElement;
  private top!: HTMLDivElement;
  private logEl!: HTMLDivElement;
  private selectedSquad: string | null = null;
  private selectedNode: string | null = null;
  private hoverNode: string | null = null;
  private time = 0;
  private hudTimer = 0;
  private busy = false;

  protected override onEnter(): void {
    if (!store.campaign && !loadGame(this.ctx.save)) {
      this.ctx.scenes.go('main_menu');
      return;
    }
    this.c = store.campaign!;
    Audio.music('world');
    this.pointer = new CanvasPointer(this.ctx.renderer);
    this.selectedSquad = this.c.squads[0]?.id ?? null;
    // Mapa ampliado: abre com o zoom no reino, centrado no primeiro esquadrão.
    this.cam.zoom = 2.6;
    this.centerOn(this.c.squads[0] ? squadPosition(this.c.squads[0]) : node(CITADEL_ID));
    this.buildUi();
    this.setupDev();
    if (store.battleResult) {
      const result = store.battleResult;
      store.battleResult = null;
      delete this.c.inBattle;
      const summary = applyBattleResult(this.c, result);
      const dungeon = dungeonAfterBattle(this.c, result);
      summary.lines.push(...dungeon.lines);
      if (summary.levelUps.length) Audio.sfx('heal');
      if (this.c.ironman) autosave(this.ctx.save);
      else {
        saveGame(this.ctx.save);
        autosave(this.ctx.save);
      }
      const story = result.context.kind === 'story' ? mission(result.context.storyId ?? '') : undefined;
      modal(result.outcome === 'victory' ? '🏆 Resultado da batalha' : result.outcome === 'fled' ? '🏃 Fuga' : '☠ Derrota', (body) => {
        for (const l of [...summary.levelUps, ...summary.lines]) body.append(h('div', { text: l }));
        for (const d of summary.dead) body.append(h('div', { style: 'color:#e57373', text: `☠ ${d} morreu. (morte permanente)` }));
        if (summary.levelUps.length) {
          // Quem subiu de nível: o botão leva direto à distribuição (atributos e teia).
          const up = pendingPoints(this.c);
          body.append(btn(`✦ Distribuir pontos (${up.length})`, () => up[0] && openEvolve(up[0], () => this.refreshHud(), up), { class: 'primary' }));
        }
        if (story && result.outcome !== 'victory') body.append(h('div', { class: 'muted', style: 'margin-top:6px', text: `📖 ${story.code} ${story.title} continua disponível: recupere-se e tente de novo.` }));
      }, {
        onClose: () => {
          if (story && result.outcome === 'victory') this.storyAfter(story);
          const sq = squadById(this.c, result.context.squadId);
          if (dungeon.next && sq && result.context.dungeon) this.dungeonBetween(sq, result.context.dungeon);
          // Encontro na estrada: quem sobreviveu segue viagem até o destino final.
          else if (result.context.kind === 'encounter' && sq?.to && fitMembers(this.c, sq).length) {
            addLog(this.c, `${sq.name} retoma a marcha.`);
            this.setSpeed(Math.max(1, this.c.speed));
          }
        },
      });
    }
    this.refreshHud();
    this.checkHideout();
    // Abertura da campanha (uma vez).
    if (!hasFlag(this.c, 'intro') && !ensureStory(this.c).done.length && !modalOpen()) {
      setFlag(this.c, 'intro');
      playDialogue(this.c, { title: 'Prólogo', subtitle: CHAPTER_TITLE[0], lines: INTRO as StoryLine[], actions: [{ label: 'Começar', primary: true, run: () => saveGame(this.ctx.save) }] });
    }
  }

  /** Fim do Ato 1: sem base ainda, o jogador escolhe o esconderijo. */
  private checkHideout(): void {
    if (this.c.act < 2 || this.c.base) return;
    openHideoutChoice(this.c, () => {
      saveGame(this.ctx.save);
      this.refreshHud();
    });
  }

  protected override onExit(): void {
    this.pointer?.dispose();
    closeMenu();
    this.ui?.remove();
    DevPanel.setGroups([]);
  }

  private get squad(): Squad | undefined {
    return squadById(this.c, this.selectedSquad);
  }

  // ───────────────────────────── loop ─────────────────────────────

  protected override onUpdate(dt: number): void {
    if (!this.c) return;
    this.time += dt;
    const { input } = this.ctx;
    if (!modalOpen()) {
      if (input.justPressed('pause')) this.setSpeed(this.c.speed === 0 ? 1 : 0);
      (['speed_1', 'speed_2', 'speed_3', 'speed_4'] as const).forEach((a, i) => input.justPressed(a) && this.setSpeed(i));
    }
    const pan = 300 * dt;
    if (input.isDown('pan_left')) this.cam.panX += pan;
    if (input.isDown('pan_right')) this.cam.panX -= pan;
    if (input.isDown('pan_up')) this.cam.panY += pan;
    if (input.isDown('pan_down')) this.cam.panY -= pan;
    const wheel = this.pointer.takeWheel();
    if (wheel) this.cam.zoom = Math.max(0.8, Math.min(8, this.cam.zoom * (wheel > 0 ? 0.9 : 1.1)));
    const [dx, dy] = this.pointer.takeDrag();
    this.cam.panX += dx;
    this.cam.panY += dy;
    this.hoverNode = this.pointer.inside ? this.nodeAt(this.pointer.x, this.pointer.y) : null;
    for (const click of this.pointer.takeClicks()) this.onClick(click.x, click.y, click.button);

    if (this.c.speed > 0 && !modalOpen() && !this.busy) {
      const events = advanceHours(this.c, SPEEDS[this.c.speed]! * dt);
      if (events.length) this.handleEvents(events);
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.renderTop();
    }
  }

  protected override onRender(): void {
    if (!this.c) return;
    drawWorld(this.ctx.renderer.ctx, this.cam, this.c, { selectedSquad: this.selectedSquad, selectedNode: this.selectedNode, hoverNode: this.hoverNode, time: this.time });
  }

  /** Centraliza a câmera num ponto do mundo. */
  private centerOn(p: { x: number; y: number }): void {
    this.cam.panX = 0;
    this.cam.panY = 0;
    const [x, y] = this.cam.toScreen(p.x, p.y);
    this.cam.panX = this.cam.viewW / 2 - x;
    this.cam.panY = this.cam.viewH / 2 - y;
  }

  private nodeAt(sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestD = 14;
    for (const n of Object.values(worldGraph().nodes)) {
      if (!nodeVisible(this.c, n)) continue;
      const [x, y] = this.cam.toScreen(n.x, n.y);
      const d = Math.hypot(x - sx, y - sy) - (n.type === 'waypoint' ? 4 : 0);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  private onClick(x: number, y: number, button: number): void {
    if (button !== 0 && button !== 2) return;
    // Minimapa: clicar leva a câmera para lá.
    const mm = minimapHit(this.cam, x, y);
    if (mm) {
      this.centerOn(mm);
      return;
    }
    const [cx, cy] = this.toClient(x, y);
    for (const s of this.c.squads) {
      const [sx, sy] = squadScreenPos(this.cam, s);
      if (Math.hypot(sx - x, sy - y) < 12) {
        this.selectedSquad = s.id;
        this.openSquadMenu(s, cx, cy);
        return;
      }
    }
    const n = this.nodeAt(x, y);
    this.selectedNode = n;
    if (n) this.openNodeMenu(n, cx, cy);
    else closeMenu();
  }

  /** Coordenadas do canvas (960×540) → tela (para posicionar o menu). */
  private toClient(x: number, y: number): [number, number] {
    const r = this.ctx.renderer.canvas.getBoundingClientRect();
    const k = r.width / this.cam.viewW;
    return [r.left + x * k, r.top + y * k];
  }

  /** Menu do local: mover esquadrões para cá e, com esquadrão presente, os serviços do lugar. */
  private openNodeMenu(id: string, cx: number, cy: number): void {
    const n = node(id);
    const country = countryOf(id);
    const here = this.c.squads.filter((s) => !s.to && s.at === id);
    const present = here.find((x) => x.id === this.selectedSquad) ?? here[0];
    const e: MenuEntry[] = [
      { label: n.type === 'waypoint' ? 'Estrada' : n.id === CITADEL_ID ? 'Citadela Real' : n.name, header: true },
      { label: `${NODE_TYPE_LABEL[n.type]}${country ? ` · ${country.name} — ${country.epithet}` : ''} · ${regionLabel(n.region)}`, info: true },
    ];
    const fallen = fallenCapitals(this.c).includes(id);
    if (fallen) e.push({ label: '🔥 Cidade caída: só ruínas. Loja, recrutamento e serviços se perderam.', info: true });
    else if (n.type === 'capital' && country) e.push({ label: `Senhor(a): ${country.lord}`, info: true });
    if (id === this.c.baseNode) e.push({ label: '★ Sua base', info: true });
    if (here.length) e.push({ label: `Aqui: ${here.map((x) => x.name).join(', ')}`, info: true });
    for (const ct of allContracts(this.c).filter((x) => x.targetNode === id && x.status === 'accepted')) e.push({ label: `📜 ${ct.crisis ? 'Crise' : 'Contrato'}: ${ct.title}`, info: true });
    const st = provinceState(this.c, id);
    e.push({ label: `🏴 ${OWNER_LABEL[st.owner]} · controle ${Math.round(st.control)} · medo ${Math.round(st.fear)}`, info: true });
    for (const f of forcesAt(this.c, id).filter((x) => forceVisible(this.c, x))) e.push({ label: `${forceIcon(f)} ${forceLabel(f)} está aqui`, info: true });
    const post = outpostAt(this.c, id);
    if (post) e.push({ label: `${OUTPOST_KINDS[post].icon} ${OUTPOST_KINDS[post].label}: ${OUTPOST_KINDS[post].text}`, info: true });
    if (ensureExpedition(this.c).treasure === id) e.push({ label: '🗺 O mapa do tesouro aponta para cá.', info: true });
    for (const cache of this.c.lostCaches.filter((x) => x.nodeId === id)) {
      const left = Math.max(0, Math.ceil(cache.expiresAt - this.c.hours));
      e.push({ label: `🎒 Itens de ${cache.squadName} — somem em ${left >= 24 ? `${Math.floor(left / 24)}d ${left % 24}h` : `${left}h`}`, info: true });
    }
    const movers = this.c.squads.filter((s) => s.to || s.at !== id);
    const canTravel = featureUnlocked(this.c, 'viagem');
    e.push({
      label: '➜ Mover para cá',
      sep: true,
      disabled: !movers.length || !canTravel,
      title: canTravel ? '' : lockedReason('viagem'),
      sub: movers.map((s) => ({
        label: `${s.name} · ${s.to ? `indo a ${placeName(s.route[s.route.length - 1] ?? s.to)}` : `em ${placeName(s.at)}`}`,
        disabled: !s.memberIds.length,
        onClick: () => this.confirmMove(s, id),
      })),
    });
    // Serviços do lugar (pedem um esquadrão presente; na base também valem sem esquadrão).
    const atBaseNode = id === this.c.baseNode;
    if (n.type === 'capital' && !fallen && (present || atBaseNode)) {
      const open = (tab: CapitalTab) => () => openCapital(this.c, id, present, () => this.refreshHud(), { tab });
      const sv = capitalService(id);
      const lock = (f: Feature) => (featureUnlocked(this.c, f) ? {} : { disabled: true, title: lockedReason(f) });
      e.push(
        { label: '🛒 Loja', sep: true, onClick: open('loja'), ...lock('loja') },
        { label: '🍺 Taverna', onClick: open('taverna'), ...lock('loja') },
        { label: '🪖 Recrutamento', onClick: open('recrutamento'), ...lock('recrutamento') },
        { label: sv ? SERVICE_LABEL[sv] : '✨ Em breve', onClick: open('especial'), disabled: !sv || !featureUnlocked(this.c, 'servicos'), title: !featureUnlocked(this.c, 'servicos') ? lockedReason('servicos') : sv ? '' : 'A particularidade desta capital ainda está sendo decidida.' },
      );
    } else if (n.type === 'capital' && !fallen) e.push({ label: 'Leve um esquadrão até aqui para usar a loja, a taverna e o recrutamento.', info: true, sep: true });
    if (n.type === 'citadel') e.push({ label: '🪖 Recrutar Aprendizes', sep: true, disabled: !featureUnlocked(this.c, 'recrutamento'), title: featureUnlocked(this.c, 'recrutamento') ? '' : lockedReason('recrutamento'), onClick: () => openCapital(this.c, id, present, () => this.refreshHud(), { recruitOnly: true }) });
    if (n.type === 'city' || n.type === 'village')
      for (const s of here)
        e.push({ label: s.resting ? `Tirar ${s.name} da estalagem` : `🛏 Estalagem para ${s.name} (${6 * travelers(this.c, s).length} ouro/dia)`, sep: s === here[0], onClick: () => (setResting(this.c, s, !s.resting), this.refreshHud()) });
    if (atBaseNode) {
      e.push({ label: '🏰 Quartel', sep: true, onClick: () => openBarracks(this.c, () => this.refreshHud()) });
      if (this.c.base) e.push({ label: '🏛 Base: Biblioteca, Forja e instalações', onClick: () => openBase(this.c, () => this.refreshHud()) });
    }
    for (const m of missionsAt(this.c, id))
      e.push({
        label: m.personal ? `★ Missão pessoal: ${m.title} (${m.personal})` : `📖 ${m.code} ${m.title}`,
        sep: true,
        title: m.goal,
        onClick: () => this.openMission(m, present),
      });
    for (const s of here) {
      const ct = contractReadyAt(this.c, s);
      if (ct) e.push({ label: `📜 ${s.name}: iniciar contrato "${ct.title}"`, sep: true, onClick: () => this.startBattle(contractSetup(this.c, s, ct)) });
    }
    // Masmorra ou covil (C6).
    if (isDungeonNode(n)) {
      const info = dungeonInfo(this.c, id);
      const st = dungeonState(this.c, id);
      e.push({ label: `⛏ ${info.title}${info.floors > 1 ? ` · ${info.floors} andares` : ''}${info.boss ? ` · chefe: ${info.boss}` : n.type === 'lair' ? ' · sem pista, só feras comuns' : ''}`, info: true, sep: true });
      if (dungeonClosed(this.c, id)) e.push({ label: '✔ Masmorra limpa.', info: true });
      else
        for (const s of here)
          e.push({ label: `⛏ ${s.name}: ${st.floor ? `voltar ao andar ${st.floor + 1}/${info.floors}` : 'entrar'}`, disabled: !fitMembers(this.c, s).length, onClick: () => this.enterDungeon(s, id) });
    }
    // Postos avançados (C18).
    if (present && !post && ensureStory(this.c).chapter >= 2 && !isDungeonNode(n) && n.type !== 'capital' && n.type !== 'citadel')
      e.push({
        label: '🏕 Construir posto avançado',
        sep: true,
        sub: (Object.keys(OUTPOST_KINDS) as OutpostKind[]).map((k) => {
          const d = OUTPOST_KINDS[k];
          const block = buildBlock(this.c, present, k);
          return {
            label: `${d.icon} ${d.label} (${d.cost} ouro, ${d.upkeep}/mês)`,
            title: block ?? d.text,
            disabled: !!block,
            onClick: () => {
              if (buildOutpost(this.c, present, k)) {
                addLog(this.c, `${d.icon} ${d.label} construído em ${n.name}.`);
                toast(`${d.label} construído.`);
                this.refreshHud();
              }
            },
          };
        }),
      });
    openMenu(cx, cy, e);
  }

  /** Menu do esquadrão (clicar na bandeira): membros, parar, estalagem. */
  private openSquadMenu(s: Squad, cx: number, cy: number): void {
    const fit = fitMembers(this.c, s).length;
    const status = s.to ? `→ ${placeName(s.route[s.route.length - 1] ?? s.to)}` : s.resting ? `💤 estalagem em ${placeName(s.at)}` : `em ${placeName(s.at)}`;
    const e: MenuEntry[] = [
      { label: s.name, header: true },
      { label: `${fit}/${s.memberIds.length} aptos · ${status}`, info: true },
    ];
    const carried = Object.values(s.carried).reduce((a, b) => a + b, 0);
    if (carried) e.push({ label: `🎒 ${carried} itens carregados`, info: true });
    if (s.escort?.length) e.push({ label: `🛡 Escoltando ${s.escort.length} (não lutam, sem XP)`, info: true });
    if (infirmaryAt(s.at) && !s.to) e.push({ label: '⛪ Na enfermaria: ferimentos saram 2× e a moral se restaura', info: true });
    e.push({
      label: '👥 Membros',
      sep: true,
      sub: travelers(this.c, s).map((m) => ({
        label: `${s.escort?.includes(m.id) ? '🛡 ' : ''}${m.name} · ${buildLabel(m)} · Nv ${m.level}${m.woundDays > 0 ? ` · ${m.severeWound ? 'grave' : 'ferido'} ${m.woundDays}d` : ''}${canSpendAttr(m) || m.skillPoints > 0 ? ' · +pts' : ''}`,
        onClick: () => openBarracks(this.c, () => this.refreshHud(), m.id),
      })),
    });
    const people = travelers(this.c, s).length;
    e.push({ label: `🍞 Rações: ${s.supplies ?? SUPPLY.start}/${supplyCap(s, people)} (≈ ${Math.floor((s.supplies ?? SUPPLY.start) / Math.max(1, dailyRations(s, people)))} dias)${(s.hungry ?? 0) > 0 ? ' · SEM COMIDA' : ''}`, info: true });
    const tired = travelers(this.c, s).filter(isTired).length;
    if (tired) e.push({ label: `😮‍💨 ${tired} cansado(s): descansem numa cidade ou na base`, info: true });
    if (!s.to && !inVoid(this.c, s) && ['city', 'village', 'capital', 'citadel'].includes(node(s.at).type))
      e.push({
        label: `🛒 Comprar rações (${SUPPLY.price} ouro cada)`,
        sub: [10, 30, 999].map((n) => ({
          label: n === 999 ? 'Encher' : `+${n}`,
          onClick: () => {
            const k = buyRations(this.c, s, people, n);
            toast(k ? `+${k} rações (−${k * SUPPLY.price} ouro).` : 'Sem espaço ou sem ouro.');
            this.refreshHud();
          },
        })),
      });
    if (!s.cart && !s.to && node(s.at).type === 'capital')
      e.push({ label: `🛒 Comprar carroça (+${SUPPLY.cartBonus} rações de carga, 200 ouro)`, disabled: this.c.gold < 200, onClick: () => ((this.c.gold -= 200), (s.cart = true), this.refreshHud()) });
    const visible = (this.c.world?.forces ?? []).filter((f) => forceVisible(this.c, f));
    if (visible.length)
      e.push({
        label: '🎯 Interceptar força',
        sub: visible.map((f) => ({ label: `${forceIcon(f)} ${forceLabel(f)} · perto de ${placeName(f.to ?? f.at)}`, onClick: () => this.confirmMove(s, interceptTarget(f)) })),
      });
    if (s.to) e.push({ label: '✋ Parar no próximo ponto', onClick: () => (stopSquad(s), this.refreshHud()) });
    e.push({
      label: s.offroad ? '🌲 Viajando pelo mato (mais lento, menos patrulhas, mais feras) — voltar à estrada' : '🛣 Viajando pela estrada — ir pelo mato',
      onClick: () => {
        s.offroad = !s.offroad;
        // Refaz a rota pelo terreno escolhido.
        const dest = s.route[s.route.length - 1] ?? s.to;
        if (dest) orderMove(this.c, s, dest);
        this.refreshHud();
      },
    });
    if (!s.to && (node(s.at).type === 'city' || node(s.at).type === 'village')) e.push({ label: s.resting ? 'Sair da estalagem' : `🛏 Estalagem (${6 * travelers(this.c, s).length} ouro/dia)`, onClick: () => (setResting(this.c, s, !s.resting), this.refreshHud()) });
    const cap = captainOf(this.c, s);
    const skillNames = (ids?: string[]) => (ids?.length ? ` (${ids.map((k) => CAPTAIN_SKILLS[k as CaptainSkill]?.label ?? k).join(', ')})` : '');
    e.push({
      label: `⭐ Capitão: ${cap ? `${cap.name}${skillNames(cap.captainSkills)}` : 'nenhum'}`,
      sub: [
        ...members(this.c, s).map((m) => ({ label: `${m.id === s.captainId ? '⭐ ' : ''}${m.name}${skillNames(m.captainSkills)}`, onClick: () => (setCaptain(s, m.id), this.refreshHud()) })),
        { label: 'Sem capitão', onClick: () => (setCaptain(s, null), this.refreshHud()) },
      ],
    });
    if (inVoid(this.c, s)) e.push({ label: '🌑 No Vazio: sem lojas nem estalagens; a corrupção sobe todo dia', info: true });
    if (canCross(this.c, s))
      e.push({
        label: inVoid(this.c, s) ? '🌅 Voltar ao mundo de cá' : '🌑 Atravessar para o Vazio (mundo invertido)',
        onClick: () => {
          crossVoid(this.c, s);
          addLog(this.c, `${s.name} ${inVoid(this.c, s) ? 'atravessou para o Vazio' : 'voltou do Vazio'}.`);
          this.refreshHud();
        },
      });
    if (ensureStory(this.c).chapter >= 6 && node(s.at).realm === 'continente') {
      const why = campBlock(this.c, s);
      e.push({ label: '⛺ Montar o acampamento de expedição aqui', title: why ?? 'Descanso, comida e cura como na base.', disabled: !!why, onClick: () => (setCamp(this.c, s), addLog(this.c, `⛺ Acampamento de expedição em ${node(s.at).name}.`), this.refreshHud()) });
    }
    const rune = runeDestinations(this.c, s);
    if (rune.length)
      e.push({
        label: `🌀 Passagem rúnica (−${OUTPOST_KINDS.passagem.jumpIntel} 👁)`,
        sub: rune.map((id) => ({
          label: node(id).name,
          onClick: () => {
            if (runeJump(this.c, s, id)) {
              addLog(this.c, `🌀 ${s.name} atravessou a passagem rúnica até ${node(id).name}.`);
              this.refreshHud();
            } else toast('Falta informação para abrir a passagem.');
          },
        })),
      });
    e.push({ label: '🚩 Estandarte (ícone e cor)', onClick: () => this.openBanner(s) });
    e.push({ label: '📍 Ver o local', onClick: () => this.openNodeMenu(s.to ? s.to : s.at, cx, cy) });
    openMenu(cx, cy, e);
  }

  /** Escolher o emblema e a cor do estandarte do esquadrão. */
  private openBanner(s: Squad): void {
    modal(`Estandarte — ${s.name}`, (body) => {
      const render = () => {
        clear(body);
        const name = h('input', { value: s.name });
        name.addEventListener('change', () => ((s.name = name.value || s.name), this.refreshHud()));
        body.append(h('div', { class: 'row' }, h('span', { class: 'muted', text: 'Nome:' }), name));
        const icons = h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'muted', text: 'Emblema:' }));
        for (const ic of SQUAD_ICONS) icons.append(btn(ic || '—', () => ((s.icon = ic), render()), { class: `small ${(s.icon ?? '') === ic ? 'active' : ''}` }));
        const colors = h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'muted', text: 'Cor:' }));
        for (const col of SQUAD_COLORS) colors.append(h('span', { class: `swatch ${s.color === col ? 'selected' : ''}`, style: `background:${col}`, onClick: () => ((s.color = col), render()) }));
        body.append(icons, colors);
      };
      render();
    });
  }

  /** Confirmação antes de mover: "Mover X para Y?". */
  private confirmMove(s: Squad, nodeId: string): void {
    modal('Mover esquadrão', (body, m) => {
      body.append(
        h('div', { style: 'margin-bottom:10px', text: `Mover ${s.name} para ${placeName(nodeId)}?` }),
        seaFee(this.c, s, nodeId) ? h('div', { class: 'muted', style: 'margin-bottom:8px', text: `⛵ Passagem de barco: ${seaFee(this.c, s, nodeId)} ouro.` }) : '',
        h('div', { class: 'row', style: 'justify-content:flex-end' },
          btn('Cancelar', () => m.close()),
          btn('Confirmar', () => {
            m.close();
            this.selectedSquad = s.id;
            this.moveSelectedTo(nodeId);
          }, { class: 'primary' }),
        ),
      );
    });
  }

  private moveSelectedTo(nodeId: string): void {
    const s = this.squad;
    if (!s) return;
    if (!fitMembers(this.c, s).length && !s.memberIds.length) return;
    if (orderMove(this.c, s, nodeId)) {
      if (this.c.speed === 0) this.setSpeed(1);
      this.refreshHud();
    }
  }

  private setSpeed(i: number): void {
    this.c.speed = i;
    this.renderTop();
  }

  // ───────────────────────────── eventos ─────────────────────────────

  private handleEvents(events: CampaignEvent[]): void {
    let dirty = false;
    for (const e of events) {
      if (e.type === 'day') {
        dirty = true;
        autosave(this.ctx.save);
      }
      if (e.type === 'month') {
        this.pause();
        modal(`📅 Relatório do mês ${e.month}`, (body) => {
          for (const l of e.report) body.append(h('div', { text: l }));
          body.append(h('div', { class: 'muted', style: 'margin-top:6px', text: 'Recrutas renovados nas capitais. Detalhes na Sala de guerra (☰).' }));
        });
        dirty = true;
        continue;
      }
      if (e.type === 'notice') {
        toast(e.text, 4200);
        // Queda de província e cerco pedem atenção: o tempo para.
        if (/caiu|cerca|Crise/.test(e.text)) this.pause();
        dirty = true;
        continue;
      }
      if (e.type === 'intercept') {
        const s = squadById(this.c, e.squadId);
        const f = (this.c.world?.forces ?? []).find((x) => x.id === e.forceId);
        if (s && f && fitMembers(this.c, s).length) {
          this.pause();
          this.forceDialog(s, f, e.byForce);
          return;
        }
        continue;
      }
      if (e.type !== 'arrived') continue;
      dirty = true;
      const s = squadById(this.c, e.squadId);
      if (!s) continue;
      const n = node(e.nodeId);
      const contract = contractReadyAt(this.c, s);
      if (contract) {
        this.pause();
        modal('📜 Contrato', (body, m) => {
          body.append(h('p', { text: `${s.name} chegou ao local do contrato: ${contract.title}.` }), h('p', { class: 'muted', text: contract.description }));
          body.append(
            h('div', { class: 'row' },
              btn('Iniciar batalha', () => {
                m.close();
                this.startBattle(contractSetup(this.c, s, contract));
              }, { class: 'primary', disabled: !fitMembers(this.c, s).length }),
              btn('Agora não', () => m.close()),
            ),
          );
        });
        return;
      }
      if (n.type === 'waypoint' && store.encountersEnabled) {
        const plan = rollEncounter(this.c, s);
        if (plan) {
          this.pause();
          this.encounterDialog(s, plan);
          return;
        }
        // Sem luta: às vezes, um evento de viagem (C17).
        const ev = rollTravelEvent(this.c, s, campaignRng(this.c));
        if (ev) {
          this.pause();
          this.travelEventDialog(s, ev);
          return;
        }
      }
      if (!s.to) {
        addLog(this.c, `${s.name} chegou a ${n.name}.`);
        if (atBase(this.c, s)) toast(`${s.name} está na base. Itens carregados foram guardados.`);
      }
    }
    if (dirty) this.refreshHud();
  }

  private pause(): void {
    this.c.speed = 0;
    this.renderTop();
  }

  /** Preparo antes do combate (C14): atacar, emboscar, cercar, negociar ou recuar. */
  private forceDialog(s: Squad, f: Force, byForce: boolean): void {
    const rng = campaignRng(this.c);
    const ambush = canAmbush(this.c, s);
    const talk = negotiateChance(this.c, s, f);
    const [lo, hi] = estimate(this.c, f.at, f.units.length);
    Audio.sfx('encounter');
    modal(byForce ? `⚠ ${forceLabel(f)} alcançou ${s.name}!` : `${forceIcon(f)} ${forceLabel(f)} à vista`, (body, m) => {
      const fight = (a: Approach) => () => {
        m.close();
        if (a === 'emboscar') for (const l of reactTo(this.c, 'emboscar')) addLog(this.c, l);
        this.startBattle(forceSetup(this.c, s, f, a));
      };
      body.append(
        h('p', { text: `${lo === hi ? lo : `${lo}–${hi}`} combatentes (nível ~${f.level}) a caminho de ${GOAL_LABEL[f.goal]} em ${node(f.target).name}.` }),
        h('p', { class: 'muted', text: `${s.name}: ${fitMembers(this.c, s).length} aptos · rações ${s.supplies ?? 0}${(s.hungry ?? 0) > 0 ? ' · COM FOME (começam enfraquecidos)' : ''}${fitMembers(this.c, s).some(isTired) ? ' · alguns cansados' : ''}` }),
        h('div', { class: 'col', style: 'gap:6px' },
          btn(byForce ? '⚔ Defender-se' : '⚔ Atacar', fight(byForce ? 'defender' : 'atacar'), { class: 'primary' }),
          byForce ? '' : btn(ambush ? '🌙 Emboscar (inimigos desavisados)' : '🌙 Emboscar — precisa de batedor (arqueiro ou ladino) e noite ou mato', fight('emboscar'), { disabled: !ambush }),
          byForce ? '' : btn(`🪤 Cercar (não fogem; +${Math.round(CMD_PREP.encircleReward * 100)}% de espólio)`, fight('cercar')),
          talk > 0
            ? btn(`🗣 Negociar (${talk}%, custa ${CMD_PREP.negotiateCost} ouro)`, () => {
                m.close();
                if (this.c.gold >= CMD_PREP.negotiateCost && rng.chance(talk / 100)) {
                  this.c.gold -= CMD_PREP.negotiateCost;
                  for (const l of reactTo(this.c, 'negociar')) addLog(this.c, l);
                  if (f.kind === 'rebeldes') crownSpare(this.c);
                  removeForce(this.c, f.id);
                  addLog(this.c, `🗣 ${s.name} negociou: ${forceLabel(f)} se dispersou.`);
                  toast('A negociação deu certo: a força se dispersou.');
                  this.refreshHud();
                } else {
                  toast('A negociação falhou! Eles atacam.');
                  this.startBattle({ ...forceSetup(this.c, s, f, 'defender'), ambush: true });
                }
              })
            : h('div', { class: 'muted', text: '🗣 Não há conversa possível com eles.' }),
          btn(`↩ Recuar (perde ${CMD_PREP.retreatHours}h)`, () => {
            m.close();
            advanceHours(this.c, CMD_PREP.retreatHours);
            addLog(this.c, `${s.name} recuou diante de ${forceLabel(f)}.`);
            this.refreshHud();
          }),
        ),
      );
    }, { closable: false });
  }

  private encounterDialog(s: Squad, plan: ReturnType<typeof planEncounter>): void {
    const fit = fitMembers(this.c, s);
    const fleeChance = Math.round(Math.max(20, Math.min(85, 55 + (fit.reduce((a, m) => a + m.attrs.spd, 0) / Math.max(1, fit.length) - 10) * 2 - (plan.ambush ? 25 : 0))));
    Audio.sfx('encounter');
    modal(plan.ambush ? '⚠ Emboscada!' : '⚔ Encontro na estrada', (body, m) => {
      body.append(
        h('p', { text: `${s.name} encontrou: ${plan.description}.` }),
        h('p', { class: 'muted', text: `Região: ${regionLabel(plan.biome)} · Nível do grupo: ${squadLevel(this.c, s)} · Aptos para lutar: ${fit.length}` }),
      );
      body.append(
        h('div', { class: 'row' },
          btn('Lutar', () => {
            m.close();
            this.startBattle(encounterSetup(this.c, s, plan));
          }, { class: 'primary', disabled: !fit.length }),
          btn(`Tentar fugir (${fleeChance}%)`, () => {
            m.close();
            if (campaignRng(this.c).chance(fleeChance / 100) || !fit.length) {
              addLog(this.c, `${s.name} evitou o encontro.`);
              toast('Fuga bem-sucedida.');
              this.setSpeed(1);
            } else {
              toast('A fuga falhou! Prepare-se para lutar.');
              this.startBattle(encounterSetup(this.c, s, { ...plan, ambush: true }));
            }
          }),
        ),
      );
    }, { closable: false });
  }

  // ───────────────────────────── história ─────────────────────────────

  /** Briefing da missão; com esquadrão no local, começa a batalha (ou conclui, se não houver luta). */
  private openMission(m: StoryMission, squad: Squad | undefined): void {
    markSeen(this.c, m.id);
    // Só começa com um esquadrão parado no local da missão (nada de disparar de longe).
    const s = squad && !squad.to && squad.at === missionNode(this.c, m) && fitMembers(this.c, squad).length ? squad : undefined;
    this.refreshHud();
    const level = s ? missionLevel(this.c, s, m) : m.level;
    const where = node(missionNode(this.c, m));
    const block = actsMissionBlock(this.c, m.id);
    const actions = !s || (block && m.battle)
      ? [{ label: 'Fechar', primary: true, run: () => undefined }]
      : m.battle
        ? [
            { label: 'Depois', run: () => undefined },
            { label: `⚔ Começar com ${s.name}`, primary: true, run: () => this.startBattle(storySetup(this.c, s, m)) },
          ]
        : [{ label: 'Continuar', primary: true, run: () => this.storyAfter(m) }];
    playDialogue(this.c, {
      title: m.personal ? `★ ${m.title}` : `📖 ${m.code} — ${m.title}`,
      subtitle: m.personal ? `Missão pessoal — ${m.personal}` : m.side ? (WORLDS[m.side]?.name ?? 'O Portal do Palácio') : CHAPTER_TITLE[m.chapter],
      lines: m.brief,
      choice: m.choice?.at === 'brief' ? m.choice : undefined,
      actions,
      footer: (el) => {
        el.append(h('div', { class: 'gold', text: `Objetivo: ${m.goal}` }));
        if (m.battle) el.append(h('div', { class: 'muted', text: `Inimigos nível ~${level}${m.battle.waves?.length ? ' · reforços chegam durante a luta' : ''}${m.battle.allies?.length ? ` · aliados: ${m.battle.allies.map((a) => a.name).join(', ')}` : ''}` }));
        if (!s) el.append(h('div', { class: 'muted', text: `Leve um esquadrão até ${placeName(where.id)} para começar.` }));
        if (block) el.append(h('div', { style: 'color:#e57373', text: `🔎 ${block}` }));
      },
    });
  }

  /** Depois da vitória (ou da missão sem luta): falas finais, escolha e consequências. */
  private storyAfter(m: StoryMission): void {
    playDialogue(this.c, {
      title: `📖 ${m.code} — ${m.title}`,
      lines: m.after,
      choice: m.choice && m.choice.at !== 'brief' ? m.choice : undefined,
      actions: [{ label: 'Continuar', primary: true, run: () => this.showOutcome(m, finishMission(this.c, m)) }],
    });
  }

  private showOutcome(m: StoryMission, out: MissionOutcome): void {
    saveGame(this.ctx.save);
    this.refreshHud();
    Audio.sfx('coin');
    modal('📖 Missão concluída', (body) => {
      body.append(h('div', { class: 'gold', text: `${m.code} ${m.title}` }));
      for (const l of out.lines) body.append(h('div', { text: l }));
      if (out.newChapter) body.append(h('div', { class: 'story-banner', text: `✦ ${out.newChapter}` }));
      const next = availableMissions(this.c);
      if (next.length && !out.ended) body.append(h('div', { class: 'muted', style: 'margin-top:6px', text: `Próximo: ${next.map((n) => `${n.code} ${n.title} (${placeName(missionNode(this.c, n))})`).join(' · ')}` }));
    }, {
      onClose: () => {
        if (out.ended) this.playEpilogue();
        else {
          this.checkHideout();
          this.showUnlocks();
        }
      },
    });
  }

  /** Tutorial: apresenta os recursos do mapa liberados pela última missão do Prólogo. */
  private showUnlocks(): void {
    const list = takeNewUnlocks(this.c);
    const next = () => {
      const u = list.shift();
      if (!u) return saveGame(this.ctx.save);
      modal(`🔓 Liberado: ${u.title}`, (body) => {
        body.append(h('p', { text: u.text }));
        if (u.g) body.append(btn('📖 Ver no glossário', () => openGlossary(u.g), { class: 'small ghost' }));
      }, { onClose: next });
    };
    next();
  }

  private mapHintEl: HTMLElement | null = null;

  /** Dicas no mapa (uma por vez, não repetem). */
  private showMapHint(): void {
    if (!settings.hints || this.mapHintEl || modalOpen()) return;
    const id = mapHints(this.c).find((x) => !settings.seenHints.includes(x) && HINTS[x]);
    if (!id) return;
    markHint(id);
    const hint = HINTS[id]!;
    const el = h('div', { class: 'panel coach map-hint' },
      h('div', { class: 'coach-title', text: '💡 Dica' }),
      h('div', { class: 'coach-text', text: hint.t }),
      h('div', { class: 'row', style: 'justify-content:flex-end;gap:6px' },
        hint.g ? btn('📖 Glossário', () => openGlossary(hint.g), { class: 'small ghost' }) : null,
        btn('Ok', () => {
          el.remove();
          this.mapHintEl = null;
        }, { class: 'small' }),
      ),
    );
    this.mapHintEl = el;
    this.ui.append(el);
  }

  /** Conversas entre missões: lista as disponíveis e toca a escolhida. */
  private openCamp(): void {
    const list = availableConversations(this.c);
    modal('💬 Conversas', (body, m) => {
      if (!list.length) body.append(h('div', { class: 'muted', text: 'Nenhuma conversa nova. Missões da história e vínculos entre heróis (lutar juntos) abrem novas conversas.' }));
      for (const conv of list)
        body.append(
          h('div', { class: 'item row', style: 'justify-content:space-between' },
            h('div', {}, h('b', { text: conv.title }), h('div', { class: 'muted', style: 'font-size:12px', text: conv.frictionLevel ? 'Atrito — o comandante media' : conv.bondLevel ? 'Vínculo' : 'História' })),
            btn('Conversar', () => {
              m.close();
              playDialogue(this.c, {
                title: `💬 ${conv.title}`,
                lines: conv.lines,
                actions: [{ label: 'Continuar', primary: true, run: () => {
                  for (const l of finishConversation(this.c, conv)) toast(l);
                  saveGame(this.ctx.save);
                  this.refreshHud();
                } }],
              });
            }, { class: 'primary small' }),
          ),
        );
    });
  }

  private playEpilogue(): void {
    playDialogue(this.c, {
      title: 'Epílogo',
      lines: EPILOGUE_LINES,
      actions: [
        {
          label: 'Fim',
          primary: true,
          run: () =>
            modal('✦ FIM ✦', (body) => {
              const end = endingOf(this.c);
              if (end) body.append(h('div', { class: 'story-banner', text: `Final: ${end.title}` }), h('p', { class: 'muted', style: 'text-align:center', text: end.text }));
              body.append(h('div', { class: 'story-banner', text: 'Obrigado por jogar.' }));
              for (const l of statsLines(this.c)) body.append(h('div', { text: l }));
              body.append(h('div', { class: 'muted', style: 'margin-top:8px', text: 'A campanha terminou, mas o mundo continua: contratos, caçadas, a base e o Vazio seguem abertos.' }));
            }),
        },
      ],
    });
  }

  /** Evento de viagem (C17): escolhas com teste de atributo. */
  private travelEventDialog(s: Squad, ev: TravelEvent): void {
    modal(`🛤 ${ev.title}`, (body, m) => {
      body.append(h('p', { text: ev.text }), h('p', { class: 'muted', text: `${s.name} · ${fitMembers(this.c, s).length} aptos · ${this.c.gold} ouro · ${s.supplies ?? SUPPLY.start} rações` }));
      const col = h('div', { class: 'col', style: 'gap:6px' });
      ev.choices.forEach((ch, i) => {
        const chance = choiceChance(this.c, s, ch);
        const label = `${ch.label}${chance !== null ? ` — ${chance}%` : ''}${traitHelps(this.c, s, ch) ? ' ✦ traço ajuda' : ''}`;
        col.append(
          btn(label, () => {
            m.close();
            const res = resolveChoice(this.c, s, ev, i, campaignRng(this.c));
            for (const l of res.lines) addLog(this.c, l);
            // Evento resolvido: ao fechar, a viagem continua.
            modal(res.ok ? `🛤 ${ev.title}` : `🛤 ${ev.title} — não deu certo`, (b) => {
              for (const l of res.lines) b.append(h('div', { text: l }));
            }, { onClose: () => s.to && this.setSpeed(Math.max(1, this.c.speed)) });
            if (res.hours) this.handleEvents(advanceHours(this.c, res.hours));
            this.refreshHud();
          }, { disabled: !canAfford(this.c, s, ch), class: i === 0 ? 'primary' : '' }),
        );
      });
      body.append(col);
    }, { closable: false });
  }

  /** Entrar numa masmorra ou covil (C6). */
  private enterDungeon(s: Squad, nodeId: string): void {
    const info = dungeonInfo(this.c, nodeId);
    const st = dungeonState(this.c, nodeId);
    modal(`⛏ ${info.title}`, (body, m) => {
      body.append(
        h('p', { text: info.floors > 1 ? `${info.floors} andares em sequência${st.floor ? ` (vocês já chegaram ao andar ${st.floor + 1})` : ''}. ${info.boss ? `No fundo: ${info.boss}.` : ''}` : info.boss ? `A fera lendária está aqui: ${info.boss}.` : 'Feras comuns fizeram ninho aqui. Sem uma pista, a fera lendária não aparece.' }),
        h('p', { class: 'muted', text: 'Lá dentro não se foge. Entre um andar e outro não há descanso: só um acampamento por descida. Sair no meio deixa o progresso pela metade.' }),
        h('div', { class: 'row' },
          btn('Entrar', () => {
            m.close();
            this.startBattle(dungeonSetup(this.c, s, nodeId));
          }, { class: 'primary', disabled: !fitMembers(this.c, s).length }),
          btn('Agora não', () => m.close()),
        ),
      );
    });
  }

  /** Entre andares: descer, acampar (uma vez) ou sair. */
  private dungeonBetween(s: Squad, nodeId: string): void {
    const info = dungeonInfo(this.c, nodeId);
    modal(`⛏ ${info.title} — andar ${dungeonState(this.c, nodeId).floor + 1}/${info.floors}`, (body, m) => {
      const render = () => {
        clear(body);
        const st = dungeonState(this.c, nodeId);
        for (const ch of members(this.c, s)) body.append(h('div', { class: 'muted', text: `${ch.name}: ${ch.hp} PV · ${ch.mp} PM${ch.woundDays > 0 ? (ch.severeWound ? ' · ferido grave (não desce)' : ' · ferido (−25% vida)') : ''}` }));
        body.append(
          h('div', { class: 'row', style: 'margin-top:8px' },
            btn(`Descer ao andar ${st.floor + 1}`, () => {
              m.close();
              this.startBattle(dungeonSetup(this.c, s, nodeId));
            }, { class: 'primary', disabled: !fitMembers(this.c, s).length }),
            btn(st.camped ? 'Acampamento já usado' : '🔥 Acampar (recupera metade da vida e da magia)', () => {
              campRest(this.c, s, nodeId);
              render();
            }, { disabled: !!st.camped }),
            btn('Sair (progresso pela metade)', () => {
              leaveDungeon(this.c, nodeId);
              addLog(this.c, `${s.name} saiu de ${info.name}.`);
              m.close();
              this.refreshHud();
            }),
          ),
        );
      };
      render();
    }, { closable: false });
  }

  private startBattle(setup: ReturnType<typeof encounterSetup>): void {
    if (!setup.players.length) {
      toast('Ninguém apto para lutar neste esquadrão.');
      return;
    }
    // Clima do dia (C7): fora das missões da história e das profundezas.
    if (setup.context.kind !== 'story' && !setup.context.dungeon) {
      const sq = squadById(this.c, setup.context.squadId);
      applyWeather(setup, weatherIn(this.c, node(sq?.at ?? CITADEL_ID).region), campaignRng(this.c));
    }
    actsBattleMods(this.c, setup, squadById(this.c, setup.context.squadId), campaignRng(this.c));
    if (this.c.ironman) this.c.inBattle = setup.context.squadId ?? 'batalha';
    saveGame(this.ctx.save);
    this.ctx.scenes.go('battle', { setup, returnTo: 'world_map' });
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private buildUi(): void {
    this.ui = layer('world-ui');
    this.top = h('div', { class: 'panel', style: 'top:6px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;white-space:nowrap' });
    this.logEl = h('div', { class: 'panel', style: 'right:8px;bottom:40px;width:270px;max-height:220px;overflow:auto;font-size:11px' });
    const help = h('div', { class: 'panel muted', style: 'left:50%;bottom:8px;transform:translateX(-50%);font-size:11px', text: 'Clique num local ou numa bandeira: ações · Espaço: pausa · 1–4: velocidade · roda: zoom · arrastar com botão direito: mover mapa' });
    this.questEl = h('div', { class: 'panel quest-tracker', title: 'Abrir o diário da campanha', onClick: () => openJournal(this.c) });
    this.ui.append(this.top, this.questEl, this.logEl, help);
  }

  private questEl!: HTMLDivElement;

  /** Rastreador da história: capítulo e próxima missão, abaixo da barra superior. */
  private renderQuest(): void {
    clear(this.questEl);
    const st = ensureStory(this.c);
    if (st.ended) {
      this.questEl.append(h('span', { class: 'gold', text: '✦ Campanha concluída' }));
      return;
    }
    const list = availableMissions(this.c);
    const title = CHAPTER_TITLE[st.chapter] ?? '';
    this.questEl.append(h('div', { class: 'quest-chapter', text: title }));
    for (const m of list.slice(0, 3))
      this.questEl.append(h('div', { class: 'quest-line' }, h('span', { class: 'quest-mark', text: m.personal ? '★' : st.seen.includes(m.id) ? '…' : '!' }), h('span', { text: `${m.personal ? `${m.title} (${m.personal})` : `${m.code} ${m.title}`} — ${placeName(missionNode(this.c, m))}` })));
    if (list.length > 3) this.questEl.append(h('div', { class: 'muted', text: `+${list.length - 3} missão(ões)` }));
  }

  private refreshHud(): void {
    this.renderTop();
    this.renderQuest();
    this.showMapHint();
    this.renderLog();
    DevPanel.refresh();
  }

  private dateEl: HTMLElement | null = null;
  private goldEl: HTMLElement | null = null;
  private speedBtns: HTMLButtonElement[] = [];
  private soldiersBtn: HTMLButtonElement | null = null;
  private talkBtn?: HTMLButtonElement;
  private logOpen = false;

  /** Monta a barra superior uma vez; depois só atualiza textos (reconstruir engoliria cliques). */
  private renderTop(): void {
    if (!this.dateEl) {
      clear(this.top);
      this.dateEl = h('b', { class: 'gold', style: 'white-space:nowrap' });
      this.goldEl = h('span', { style: 'white-space:nowrap' });
      const speeds = h('div', { class: 'row', style: 'flex-wrap:nowrap' });
      this.speedBtns = SPEED_LABEL.map((label, i) => btn(label, () => this.setSpeed(i), { class: 'small' }));
      speeds.append(...this.speedBtns);
      const menuBtn = btn('☰', () => {
        const r = menuBtn.getBoundingClientRect();
        openMenu(r.left, r.bottom + 4, this.mainMenu());
      }, { class: 'small', title: 'Menu: Quartel, Base, Bestiário…' });
      // Atalho para a lista de soldados, com o número de quem tem pontos para distribuir.
      this.soldiersBtn = btn('👥', () => openSoldiers(this.c, () => this.refreshHud()), { class: 'small', title: 'Soldados: lista de todos e quem tem pontos para distribuir' });
      // Conversas novas: (!) na barra de cima, abre a lista direto.
      this.talkBtn = btn('💬', () => this.openCamp(), { class: 'small', title: 'Conversas novas entre os heróis' });
      this.top.append(this.dateEl, menuBtn, this.soldiersBtn, this.talkBtn, this.goldEl, speeds);
    }
    const talks = availableConversations(this.c).length;
    this.talkBtn!.textContent = talks ? `💬 (!) ${talks}` : '💬';
    this.talkBtn!.style.display = talks ? '' : 'none';
    this.talkBtn!.classList.toggle('primary', talks > 0);
    const pend = pendingPoints(this.c).length;
    this.soldiersBtn!.textContent = pend ? `👥 ● ${pend}` : '👥';
    this.soldiersBtn!.classList.toggle('primary', pend > 0);
    this.dateEl.textContent = `${dateLabel(this.c)} · ${seasonLabel(this.c)}`;
    this.dateEl.title = `Dificuldade: ${difficultyLabel(this.c)}`;
    this.goldEl!.textContent = `💰 ${this.c.gold}${veilActive(this.c) ? ` · ${ensureStory(this.c).chapter >= 7 ? '⏳ Despertar' : '🜏 Véu'} ${this.c.veil?.value ?? 0}/100` : ''}`;
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', this.c.speed === i));
  }

  /** Menu expansível ao lado da data: tudo que não depende de um local do mapa. */
  private mainMenu(): MenuEntry[] {
    const done = () => this.refreshHud();
    const base = this.c.base;
    const noBase = 'A base é fundada no fim do Ato 1.';
    const baseTab = (label: string, tab: BaseTab): MenuEntry => ({ label, disabled: !base, title: base ? '' : noBase, onClick: () => openBase(this.c, done, tab) });
    return [
      (() => {
        const n = pendingPoints(this.c).length;
        return { label: `👥 Soldados${n ? ` (● ${n} com pontos)` : ''}`, onClick: () => openSoldiers(this.c, done) };
      })(),
      { label: t('🏰 Quartel'), onClick: () => openBarracks(this.c, done) },
      { label: t('🗺 Sala de guerra'), onClick: () => openWarRoom(this.c, (id) => this.centerOn(node(id))) },
      {
        label: t('🚩 Esquadrões'),
        sub: this.c.squads.map((s) => ({
          label: `${s.name} · ${fitMembers(this.c, s).length}/${s.memberIds.length} · ${s.to ? `→ ${placeName(s.route[s.route.length - 1] ?? s.to)}` : placeName(s.at)}`,
          onClick: () => {
            this.selectedSquad = s.id;
            const p = squadScreenPos(this.cam, s);
            const [cx, cy] = this.toClient(p[0], p[1]);
            this.openSquadMenu(s, cx, cy);
          },
        })),
      },
      baseTab(t('📚 Biblioteca'), 'pesquisa'),
      baseTab(t('⚒ Forja'), 'forja'),
      baseTab(t('💎 Joias'), 'joias'),
      baseTab(t('👷 Trabalho'), 'trabalho'),
      baseTab(t('🏗 Instalações'), 'instalacoes'),
      { label: t('📜 Diário da campanha'), onClick: () => openJournal(this.c) },
      { label: t('📚 Códice'), onClick: () => openJournal(this.c, 'codice') },
      (() => {
        const n = availableConversations(this.c).length;
        return { label: `💬 Conversas${n ? ` (${n} nova${n > 1 ? 's' : ''})` : ''}`, onClick: () => this.openCamp() };
      })(),
      { label: t('❔ Glossário'), onClick: () => openGlossary() },
      { label: t('📖 Bestiário conhecido'), onClick: () => openKnownBestiary(this.c) },
      { label: t('🎓 Academia de Treino'), disabled: !base, title: base ? 'Habilidades de capitão (Instalações da base).' : noBase, onClick: () => openBase(this.c, done, 'instalacoes') },
      { label: this.logOpen ? '🗒 Esconder registro' : '🗒 Mostrar registro de eventos', sep: true, onClick: () => ((this.logOpen = !this.logOpen), this.renderLog()) },
      {
        label: this.c.ironman ? '💾 Salvar (Modo Ferro)' : t('💾 Salvar'),
        onClick: () => {
          saveGame(this.ctx.save);
          toast('Jogo salvo.');
        },
      },
      { label: t('💾 Salvar em…'), disabled: !!this.c.ironman, title: this.c.ironman ? 'Modo Ferro: um único save.' : '', onClick: () => openSaveAs(this.ctx.save) },
      {
        label: t('📂 Carregar'),
        disabled: !!this.c.ironman,
        title: this.c.ironman ? 'Modo Ferro: não há como voltar atrás.' : '',
        onClick: () => openLoad(this.ctx.save, (slot) => loadGame(this.ctx.save, slot) && this.ctx.scenes.go('world_map')),
      },
      { label: t('⚙ Opções'), onClick: () => openOptions(() => this.refreshHud()) },
      {
        label: t('🚪 Menu principal'),
        onClick: () => {
          saveGame(this.ctx.save);
          this.ctx.scenes.go('main_menu');
        },
      },
    ];
  }

  private renderLog(): void {
    clear(this.logEl);
    this.logEl.style.display = this.logOpen ? '' : 'none';
    if (!this.logOpen) return;
    this.logEl.append(h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: 'Registro' }), btn('✕', () => ((this.logOpen = false), this.renderLog()), { class: 'small ghost' })));
    for (const l of this.c.log.slice(0, 20)) this.logEl.append(h('div', { text: `Dia ${l.day}: ${l.text}` }));
  }

  // ───────────────────────────── dev ─────────────────────────────

  private setupDev(): void {
    const tierButtons = (['comum', 'raro', 'epico', 'lendario'] as Rarity[]).map((tier) => ({
      label: `Encontro ${tier}`,
      run: () => {
        const s = this.squad;
        if (!s) return toast('Selecione um esquadrão.');
        const biome = node(this.selectedNode ?? s.at).biome;
        const plan = planEncounter(campaignRng(this.c), biome, squadLevel(this.c, s), tier);
        this.encounterDialog(s, plan);
      },
    }));
    DevPanel.setGroups([
      {
        title: 'Campanha',
        actions: [
          { label: '+1000 ouro', run: () => ((this.c.gold += 1000), this.refreshHud()) },
          { label: '+1 dia', run: () => this.handleEvents(advanceHours(this.c, 24)) },
          { label: '+1 mês', run: () => this.handleEvents(advanceHours(this.c, 24 * 30)) },
          {
            label: 'Pular missão da história',
            run: () => {
              const m = availableMissions(this.c)[0];
              if (!m) return toast('Nenhuma missão disponível.');
              this.showOutcome(m, finishMission(this.c, m));
            },
          },
          {
            label: 'Copiar telemetria (JSON)',
            run: () => {
              const json = JSON.stringify(ensureStats(this.c), null, 1);
              void navigator.clipboard?.writeText(json).then(() => toast('Telemetria copiada.'), () => toast('Sem acesso à área de transferência.'));
              console.info(json);
            },
          },
          { label: 'Próximo ato (sem história)', run: () => (advanceAct(this.c), this.refreshHud(), this.checkHideout()) },
          { label: 'Fundar base agora', run: () => (this.c.base ? toast('A base já existe.') : openHideoutChoice(this.c, () => this.refreshHud())) },
          {
            label: '+10 de cada material',
            run: () => {
              for (const m of Object.values(DB.materials)) this.c.materials[m.id] = (this.c.materials[m.id] ?? 0) + 10;
              for (const id of Object.keys(DB.creatures).slice(0, 30)) this.c.speciesKills[id] = Math.max(3, this.c.speciesKills[id] ?? 0);
              toast('+10 de cada material e 3 abates de 30 espécies.');
              this.refreshHud();
            },
          },
          { label: 'Renovar recrutas', run: () => (capitals().forEach((cap) => refreshRecruits(this.c, cap.id)), toast('Recrutas renovados.')) },
          { label: store.encountersEnabled ? 'Desligar encontros' : 'Ligar encontros', run: () => ((store.encountersEnabled = !store.encountersEnabled), this.setupDev()) },
        ],
      },
      {
        title: 'Esquadrão selecionado',
        actions: [
          { label: 'Teleportar p/ local', run: () => this.devTeleport() },
          { label: 'Curar todos', run: () => { for (const ch of Object.values(this.c.roster)) { ch.woundDays = 0; fullHeal(ch); } this.refreshHud(); } },
          { label: '+1 nível', run: () => { const s = this.squad; if (s) for (const m of members(this.c, s)) gainXp(m, xpToNext(m.level) - m.xp); this.refreshHud(); } },
          { label: 'Criar esquadrão teste (Nv 5)', run: () => this.devSquad(5) },
          { label: 'Base = local', run: () => { if (this.selectedNode && node(this.selectedNode).type !== 'waypoint') { this.c.baseNode = this.selectedNode; this.refreshHud(); } } },
          { label: 'Abrir capital', run: () => { const id = this.selectedNode; if (id && node(id).type === 'capital') openCapital(this.c, id, this.squad, () => this.refreshHud()); else toast('Selecione uma capital.'); } },
        ],
      },
      {
        title: 'História (pular para o capítulo)',
        actions: Object.entries(CHAPTER_TITLE).map(([n, title]) => ({ label: title.split(' — ')[0]!, run: () => this.devChapter(Number(n)) })),
      },
      { title: 'Encontros (bioma do local selecionado)', actions: tierButtons },
      {
        title: 'Ferramentas',
        actions: [
          { label: 'Editor de mapas', run: () => { saveGame(this.ctx.save); this.ctx.scenes.go('map_editor'); } },
          { label: 'Bestiário', run: () => { saveGame(this.ctx.save); this.ctx.scenes.go('bestiary'); } },
        ],
      },
    ]);
  }

  /** Dev: começa o capítulo `n` com os anteriores concluídos (ato e base acompanham). */
  devChapter(n: number): void {
    const st = ensureStory(this.c);
    st.chapter = n;
    st.ended = false;
    st.done = STORY.filter((m) => m.chapter < n).map((m) => m.id);
    st.lost = [];
    this.c.act = Math.max(1, n);
    this.refreshHud();
    this.checkHideout();
    toast(`História: ${CHAPTER_TITLE[n]}`);
  }

  private devTeleport(): void {
    const s = this.squad;
    if (!s || !this.selectedNode) return toast('Selecione esquadrão e local.');
    s.at = this.selectedNode;
    s.to = null;
    s.route = [];
    s.progress = 0;
    this.refreshHud();
  }

  private devSquad(level: number): void {
    const chars = devCharacters(level, Math.floor(Math.random() * 1e6));
    for (const ch of chars) this.c.roster[ch.id] = ch;
    const s = createSquad(this.c, chars.map((ch) => ch.id));
    if (s) {
      s.name = `Teste Nv ${level}`;
      this.selectedSquad = s.id;
    }
    this.refreshHud();
  }
}
