import { Scene } from '@core';
import { btn, clear, h, layer, modal, modalOpen, toast } from '@ui/dom';
import { DB, type Rarity } from '../../data';
import { DevPanel } from '../../dev/dev_panel';
import { Audio } from '../../audio/audio';
import { devCharacters } from '../../dev/dev_squad';
import { BIOME_LABEL } from '../../mapgen/generator';
import { CanvasPointer } from '../../render/pointer';
import { WorldCamera, drawWorld, squadScreenPos } from '../../render/world_renderer';
import { fullHeal, gainXp, xpToNext } from '../../rules/character';
import { loadGame, saveGame, store } from '../../state/store';
import {
  SPEEDS,
  SPEED_LABEL,
  addLog,
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
  refreshRecruits,
  setResting,
  squadById,
  stopSquad,
  type Campaign,
  type CampaignEvent,
  type Squad,
} from '../../world/campaign';
import { applyBattleResult, contractSetup, encounterSetup, planEncounter, rollEncounter, squadLevel } from '../../world/encounters';
import { capitals, countryOf, node, worldGraph } from '../../world/layout';
import { openBarracks } from './barracks_screen';
import { openCapital } from './capital_screen';

const NODE_TYPE_LABEL = { citadel: 'Citadela', capital: 'Capital', city: 'Cidade (ponto de descanso)', waypoint: 'Estrada' } as const;

export class WorldMapScene extends Scene {
  readonly id = 'world_map';
  protected override readonly systems = ['debug_overlay'];

  private c!: Campaign;
  private cam = new WorldCamera(960, 540);
  private pointer!: CanvasPointer;
  private ui!: HTMLDivElement;
  private top!: HTMLDivElement;
  private left!: HTMLDivElement;
  private info!: HTMLDivElement;
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
    this.buildUi();
    this.setupDev();
    if (store.battleResult) {
      const result = store.battleResult;
      store.battleResult = null;
      const summary = applyBattleResult(this.c, result);
      if (summary.levelUps.length) Audio.sfx('heal');
      saveGame(this.ctx.save);
      modal(result.outcome === 'victory' ? '🏆 Resultado da batalha' : result.outcome === 'fled' ? '🏃 Fuga' : '☠ Derrota', (body) => {
        for (const l of [...summary.levelUps, ...summary.lines]) body.append(h('div', { text: l }));
        for (const d of summary.dead) body.append(h('div', { style: 'color:#e57373', text: `☠ ${d} morreu. (morte permanente)` }));
        if (summary.levelUps.length) body.append(h('div', { class: 'gold', style: 'margin-top:6px', text: 'Distribua os pontos novos no Quartel.' }));
      });
    }
    this.refreshHud();
  }

  protected override onExit(): void {
    this.pointer?.dispose();
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
    if (wheel) this.cam.zoom = Math.max(0.8, Math.min(3, this.cam.zoom * (wheel > 0 ? 0.9 : 1.1)));
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

  private nodeAt(sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestD = 14;
    for (const n of Object.values(worldGraph().nodes)) {
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
    if (button === 0) {
      for (const s of this.c.squads) {
        const [sx, sy] = squadScreenPos(this.cam, s);
        if (Math.hypot(sx - x, sy - y) < 12) {
          this.selectedSquad = s.id;
          this.refreshHud();
          return;
        }
      }
      const n = this.nodeAt(x, y);
      this.selectedNode = n;
      this.refreshHud();
    } else if (button === 2) {
      const n = this.nodeAt(x, y);
      if (n && this.squad) this.moveSelectedTo(n);
    }
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
        if (e.day % 1 === 0) saveGame(this.ctx.save);
      }
      if (e.type === 'month') toast('Novo mês: recrutas renovados nas capitais.');
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

  private encounterDialog(s: Squad, plan: ReturnType<typeof planEncounter>): void {
    const fit = fitMembers(this.c, s);
    const fleeChance = Math.round(Math.max(20, Math.min(85, 55 + (fit.reduce((a, m) => a + m.attrs.spd, 0) / Math.max(1, fit.length) - 10) * 2 - (plan.ambush ? 25 : 0))));
    Audio.sfx('encounter');
    modal(plan.ambush ? '⚠ Emboscada!' : '⚔ Encontro na estrada', (body, m) => {
      body.append(
        h('p', { text: `${s.name} encontrou: ${plan.description}.` }),
        h('p', { class: 'muted', text: `Bioma: ${BIOME_LABEL[plan.biome]} · Nível do grupo: ${squadLevel(this.c, s)} · Aptos para lutar: ${fit.length}` }),
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

  private startBattle(setup: ReturnType<typeof encounterSetup>): void {
    if (!setup.players.length) {
      toast('Ninguém apto para lutar neste esquadrão.');
      return;
    }
    saveGame(this.ctx.save);
    this.ctx.scenes.go('battle', { setup, returnTo: 'world_map' });
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private buildUi(): void {
    this.ui = layer('world-ui');
    this.top = h('div', { class: 'panel', style: 'top:6px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;white-space:nowrap' });
    this.left = h('div', { class: 'panel', style: 'left:8px;top:60px;width:240px;max-height:calc(100vh - 80px);overflow:auto' });
    this.info = h('div', { class: 'panel', style: 'right:8px;top:60px;width:270px' });
    this.logEl = h('div', { class: 'panel', style: 'right:8px;bottom:50px;width:270px;max-height:200px;overflow:auto;font-size:11px' });
    const help = h('div', { class: 'panel muted', style: 'left:50%;bottom:8px;transform:translateX(-50%);font-size:11px', text: 'Clique: selecionar · Botão direito num local: mover esquadrão · Espaço: pausa · 1–4: velocidade · roda: zoom · arrastar com botão direito: mover mapa' });
    this.ui.append(this.top, this.left, this.info, this.logEl, help);
  }

  private refreshHud(): void {
    this.renderTop();
    this.renderSquads();
    this.renderInfo();
    this.renderLog();
    DevPanel.refresh();
  }

  private dateEl: HTMLElement | null = null;
  private goldEl: HTMLElement | null = null;
  private speedBtns: HTMLButtonElement[] = [];

  /** Monta a barra superior uma vez; depois só atualiza textos (reconstruir engoliria cliques). */
  private renderTop(): void {
    if (!this.dateEl) {
      clear(this.top);
      this.dateEl = h('b', { class: 'gold', style: 'white-space:nowrap' });
      this.goldEl = h('span', { style: 'white-space:nowrap' });
      const speeds = h('div', { class: 'row', style: 'flex-wrap:nowrap' });
      this.speedBtns = SPEED_LABEL.map((label, i) => btn(label, () => this.setSpeed(i), { class: 'small' }));
      speeds.append(...this.speedBtns);
      this.top.append(
        this.dateEl,
        this.goldEl,
        speeds,
        btn('🏰 Quartel', () => openBarracks(this.c, () => this.refreshHud()), { class: 'small' }),
        btn('💾 Salvar', () => {
          saveGame(this.ctx.save);
          toast('Jogo salvo.');
        }, { class: 'small' }),
        btn('Menu', () => {
          saveGame(this.ctx.save);
          this.ctx.scenes.go('main_menu');
        }, { class: 'small' }),
      );
    }
    this.dateEl.textContent = dateLabel(this.c);
    this.goldEl!.textContent = `💰 ${this.c.gold}`;
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', this.c.speed === i));
  }

  private renderSquads(): void {
    clear(this.left);
    this.left.append(h('h3', { text: 'Esquadrões' }));
    for (const s of this.c.squads) {
      const status = s.to ? `→ ${node(s.route[s.route.length - 1] ?? s.to).name}` : s.resting ? `💤 estalagem em ${node(s.at).name}` : `em ${node(s.at).name}`;
      const fit = fitMembers(this.c, s).length;
      this.left.append(
        h(
          'div',
          { class: `item ${s.id === this.selectedSquad ? 'selected' : ''}`, onClick: () => ((this.selectedSquad = s.id), this.refreshHud()) },
          h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: s.name, style: `color:${s.color}` }), h('span', { class: 'muted', text: `${fit}/${s.memberIds.length} aptos` })),
          h('div', { class: 'muted', text: status }),
          Object.keys(s.carried).length ? h('div', { class: 'muted', style: 'font-size:11px', text: `🎒 ${Object.values(s.carried).reduce((a, b) => a + b, 0)} itens carregados` }) : null,
        ),
      );
    }
    const s = this.squad;
    if (s) {
      this.left.append(h('h3', { style: 'margin-top:8px', text: 'Membros' }));
      for (const m of members(this.c, s))
        this.left.append(
          h('div', { class: 'item', onClick: () => openBarracks(this.c, () => this.refreshHud(), m.id) },
            h('b', { text: m.name }),
            h('span', { class: 'muted', text: ` ${DB.classes[m.classId].name} Nv ${m.level}` }),
            m.woundDays > 0 ? h('span', { class: 'tag', style: 'color:#e57373', text: `ferido ${m.woundDays}d` }) : null,
            m.statPoints > 0 ? h('span', { class: 'tag gold', text: '+pts' }) : null,
          ),
        );
      if (s.to) this.left.append(btn('Parar no próximo ponto', () => (stopSquad(s), this.refreshHud())));
    }
  }

  private renderInfo(): void {
    clear(this.info);
    const id = this.selectedNode;
    if (!id) {
      this.info.append(h('h3', { text: 'Local' }), h('div', { class: 'muted', text: 'Clique num local do mapa.' }));
      return;
    }
    const n = node(id);
    const country = countryOf(id);
    const here = this.c.squads.filter((s) => !s.to && s.at === id);
    const s = this.squad;
    this.info.append(
      h(
        'div',
        {},
        h('h3', { text: n.type === 'waypoint' ? 'Estrada' : n.name }),
        h('div', { class: 'muted', text: `${NODE_TYPE_LABEL[n.type]}${country ? ` · ${country.name}` : ''} · ${BIOME_LABEL[n.biome]}` }),
        id === this.c.baseNode ? h('div', { class: 'gold', text: '★ Sua base' }) : null,
        here.length ? h('div', { text: `Aqui: ${here.map((x) => x.name).join(', ')}` }) : null,
      ),
    );
    const actions = h('div', { class: 'col', style: 'margin-top:6px' });
    if (s) actions.append(btn(`Mover ${s.name} para cá`, () => this.moveSelectedTo(id), { disabled: !s.to && s.at === id }));
    if (n.type === 'capital' || (n.type === 'citadel' && id === this.c.baseNode)) {
      const present = here.find((x) => x.id === this.selectedSquad) ?? here[0];
      if (n.type === 'capital') actions.append(btn('🏙 Entrar na capital', () => openCapital(this.c, id, present, () => this.refreshHud()), { disabled: !present && id !== this.c.baseNode }));
    }
    if (n.type === 'citadel') {
      const present = here.find((x) => x.id === this.selectedSquad) ?? here[0];
      actions.append(btn('🪖 Recrutar Aprendizes', () => openCapital(this.c, id, present, () => this.refreshHud(), { recruitOnly: true })));
    }
    if (n.type === 'city' && s && !s.to && s.at === id)
      actions.append(btn(s.resting ? 'Sair da estalagem' : `🛏 Estalagem (${6 * s.memberIds.length} ouro/dia)`, () => (setResting(this.c, s, !s.resting), this.refreshHud())));
    if (id === this.c.baseNode) actions.append(btn('🏰 Quartel (base)', () => openBarracks(this.c, () => this.refreshHud())));
    if (s && !s.to && s.at === id) {
      const ct = contractReadyAt(this.c, s);
      if (ct) actions.append(btn(`📜 Iniciar contrato: ${ct.title}`, () => this.startBattle(contractSetup(this.c, s, ct)), { class: 'primary' }));
    }
    this.info.append(actions);
    const contracts = Object.values(this.c.contracts)
      .flat()
      .filter((ct) => ct.targetNode === id && ct.status === 'accepted');
    if (contracts.length) this.info.append(h('div', { class: 'gold', text: `📜 Contrato aqui: ${contracts.map((x) => x.title).join('; ')}` }));
  }

  private renderLog(): void {
    clear(this.logEl);
    this.logEl.append(h('h3', { text: 'Diário' }));
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
          { label: 'Próximo ato', run: () => (advanceAct(this.c), this.refreshHud()) },
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
